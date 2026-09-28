"""Command-line interface: ``uv run mentoragent --help``."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from loguru import logger

from mentoragent.core.config import settings
from mentoragent.core.logging import configure_logging

app = typer.Typer(
    name="mentoragent",
    help="MentorAgents backend: serve the API and manage mentor data.",
    no_args_is_help=True,
    pretty_exceptions_show_locals=False,  # locals may contain secrets
)


@app.callback()
def _setup() -> None:
    configure_logging()


@app.command()
def serve(
    host: Annotated[str | None, typer.Option(help="Bind address [default: HOST]")] = None,
    port: Annotated[int | None, typer.Option(help="Port [default: PORT]")] = None,
    reload: Annotated[bool | None, typer.Option(help="Autoreload [default: RELOAD]")] = None,
    workers: Annotated[int, typer.Option(help="Worker processes (ignored with reload)")] = 1,
) -> None:
    """Run the API server."""
    import uvicorn

    use_reload = settings.server.RELOAD if reload is None else reload
    uvicorn.run(
        "mentoragent.api.main:app",
        host=host or settings.server.HOST,
        port=port or settings.server.PORT,
        reload=use_reload,
        workers=None if use_reload else workers,
        log_config=None,  # uvicorn logs flow through loguru (see core.logging)
        access_log=False,  # requests are logged by our middleware, with request ids
        proxy_headers=True,
    )


@app.command("load-mentors")
def load_mentors(
    metadata_file: Annotated[
        Path,
        typer.Option(exists=True, dir_okay=False, help="Mentor metadata JSON file."),
    ] = settings.paths.EXTRACTION_METADATA_FILE_PATH,
) -> None:
    """Insert or update the mentors listed in the metadata file (idempotent)."""
    from mentoragent.db.client import MongoRepository
    from mentoragent.models.mentor_extract import MentorExtract

    mentors = MentorExtract.from_json(metadata_file)
    if not mentors:
        logger.warning("No mentors in {}", metadata_file)
        raise typer.Exit(code=1)

    repository = MongoRepository(MentorExtract, settings.mongo.MENTORS_COLLECTION)
    repository.collection.create_index("id", unique=True)
    count = repository.upsert_documents(mentors)
    logger.info("Saved {} mentors", count)


@app.command("create-memory")
def create_memory(
    sample: Annotated[
        bool, typer.Option(help="Only a few documents per source, for a quick smoke run.")
    ] = False,
) -> None:
    """Extract every mentor's sources and rebuild the long-term memory."""
    from mentoragent.rag.memory.long_term_memory_creator import LongTermMemoryCreator

    total = LongTermMemoryCreator.build()(sample=sample)
    if total == 0:
        logger.error("No documents were ingested; run `load-mentors` first")
        raise typer.Exit(code=1)


@app.command("delete-memory")
def delete_memory(
    yes: Annotated[bool, typer.Option("--yes", help="Skip the confirmation prompt.")] = False,
) -> None:
    """Delete the long-term memory collection."""
    from mentoragent.services.maintenance import delete_long_term_memory

    if not yes:
        typer.confirm("Delete the whole long-term memory?", abort=True)
    logger.info("Dropped: {}", delete_long_term_memory() or "nothing to delete")


@app.command("reset-conversations")
def reset_conversations(
    yes: Annotated[bool, typer.Option("--yes", help="Skip the confirmation prompt.")] = False,
) -> None:
    """Delete every conversation's short-term memory."""
    from mentoragent.services.maintenance import reset_conversation_state

    if not yes:
        typer.confirm("Delete every conversation history?", abort=True)
    logger.info("Dropped: {}", reset_conversation_state() or "nothing to delete")


@app.command("generate-dataset")
def generate_dataset(
    temperature: Annotated[float, typer.Option(help="LLM sampling temperature.")] = 0.9,
    max_samples: Annotated[int, typer.Option(help="Maximum samples to generate.")] = 40,
) -> None:
    """Generate a synthetic evaluation dataset from the mentors' sources."""
    from mentoragent.evals.generate_dataset import EvaluationDatasetGenerator

    EvaluationDatasetGenerator(temperature=temperature, max_samples=max_samples)()


@app.command()
def evaluate(
    name: Annotated[str, typer.Option(help="Opik dataset name.")] = "mentoragents_evaluation",
    data_path: Annotated[
        Path, typer.Option(exists=True, dir_okay=False, help="Dataset JSON file.")
    ] = settings.paths.EVALUATION_DATASET_FILE_PATH,
    workers: Annotated[int, typer.Option(help="Concurrent samples.")] = 1,
    nb_samples: Annotated[int | None, typer.Option(help="Evaluate only N samples.")] = 20,
) -> None:
    """Upload the evaluation dataset to Opik and score the agent on it."""
    from mentoragent.evals.evaluate import evaluate_agent
    from mentoragent.evals.upload_dataset import upload_dataset
    from mentoragent.infra.opik_utils import configure_opik

    if not configure_opik():
        logger.error("Evaluation needs Opik: set COMET_API_KEY")
        raise typer.Exit(code=1)
    evaluate_agent(upload_dataset(name, data_path), workers=workers, nb_samples=nb_samples)


if __name__ == "__main__":
    app()
