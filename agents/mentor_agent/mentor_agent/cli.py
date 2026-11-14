"""Command-line interface: ``uv run mentor-agent --help``."""

from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Annotated

import typer
from loguru import logger

from mentor_agent.config import settings
from mentor_agent.core.errors import MentorAgentError
from mentor_agent.core.logs import configure_logging

if TYPE_CHECKING:
    from collections.abc import Callable

    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.conversation import ConversationService
    from mentor_agent.services.mentors import MentorService

app = typer.Typer(
    name="mentor-agent",
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
        "mentor_agent.main:app",
        host=host or settings.server.HOST,
        port=port or settings.server.PORT,
        reload=use_reload,
        workers=None if use_reload else workers,
        log_config=None,  # uvicorn logs flow through loguru (see logs.py)
        access_log=False,  # requests are logged by our middleware, with request ids
        proxy_headers=True,
    )


@app.command()
def call(
    mentor_id: Annotated[str, typer.Option(help="Id of the mentor to talk to.")],
    query: Annotated[str, typer.Option(help="Your message.")],
    conversation_id: Annotated[
        str | None, typer.Option(help="Continue this conversation (default: start a new one).")
    ] = None,
) -> None:
    """Ask a mentor one question and stream the reply to the terminal."""
    from mentor_agent.config.base import MissingSettingError
    from mentor_agent.core.bootstrap import build_conversation_service
    from mentor_agent.core.errors import MentorAgentError
    from mentor_agent.db.client import AsyncMongoRepository, close_mongo_clients
    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.mentors import MentorService

    async def run() -> str:
        mentors = MentorService(
            AsyncMongoRepository(MentorExtract, settings.mongo.MENTORS_COLLECTION)
        )
        try:
            return await call_mentor(
                build_conversation_service(),
                mentors,
                mentor_id=mentor_id,
                query=query,
                conversation_id=conversation_id or uuid.uuid4().hex,
                write=sys.stdout.write,
            )
        finally:
            await close_mongo_clients()

    try:
        used_id = asyncio.run(run())
    except (MentorAgentError, MissingSettingError) as exc:
        # An expected failure (unknown mentor, the model not answering, no API key):
        # a clean message and a non-zero exit, not a traceback.
        message = exc.message if isinstance(exc, MentorAgentError) else str(exc)
        typer.echo(f"error: {message}", err=True)
        raise typer.Exit(code=1) from exc
    # On stderr, so stdout carries only the reply and can be piped.
    typer.echo(f"\nconversation id: {used_id} (pass --conversation-id to continue)", err=True)


async def call_mentor(
    conversations: ConversationService,
    mentors: MentorService,
    *,
    mentor_id: str,
    query: str,
    conversation_id: str,
    write: Callable[[str], object],
) -> str:
    """Stream one reply from ``mentor_id`` through ``write``; return the conversation id.

    Raises:
        MentorNotFoundError: If no mentor has this id.
        ConversationError: If the agent fails to reply.
    """
    mentor = (await mentors.get_mentor(mentor_id)).to_mentor()
    async for token in conversations.stream(mentor, query, conversation_id):
        write(token)
    write("\n")
    return conversation_id


@app.command("load-mentors")
def load_mentors(
    metadata_file: Annotated[
        Path,
        typer.Option(exists=True, dir_okay=False, help="Mentor metadata JSON file."),
    ] = settings.paths.EXTRACTION_METADATA_FILE_PATH,
) -> None:
    """Insert or update the mentors listed in the metadata file (idempotent)."""
    from mentor_agent.db.client import MongoRepository
    from mentor_agent.models.mentor_extract import MentorExtract

    mentors = MentorExtract.from_json(metadata_file)
    if not mentors:
        logger.warning("No mentors in {}", metadata_file)
        raise typer.Exit(code=1)

    repository = MongoRepository(MentorExtract, settings.mongo.MENTORS_COLLECTION)
    repository.collection.create_index("id", unique=True)
    count = repository.upsert_documents(mentors)
    logger.info("Saved {} mentors", count)


@app.command("add-mentor")
def add_mentor(
    mentor_id: Annotated[
        str | None, typer.Option(help="A pool mentor's id (default: a random one).")
    ] = None,
    build_memory: Annotated[
        bool, typer.Option(help="Build their long-term memory now (calls the embeddings API).")
    ] = True,
) -> None:
    """Add a mentor from the pool (data/mentor_pool.json) to the square."""
    import random

    from mentor_agent.db.client import MongoRepository
    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.pool import load_pool, pick_new_mentor

    pool = load_pool(settings.paths.MENTOR_POOL_FILE_PATH)
    if mentor_id is not None:
        pool = [mentor for mentor in pool if mentor.id == mentor_id]
        if not pool:
            typer.echo(f"error: no mentor {mentor_id!r} in the pool", err=True)
            raise typer.Exit(code=1)
    repository = MongoRepository(MentorExtract, settings.mongo.MENTORS_COLLECTION)
    existing = {mentor.id for mentor in repository.fetch_documents({})}
    try:
        mentor = pick_new_mentor(pool, existing, random.Random())  # noqa: S311 - not secret
    except MentorAgentError as exc:
        typer.echo(f"error: {exc.message}", err=True)
        raise typer.Exit(code=1) from exc
    repository.upsert_documents([mentor])
    logger.info("Added {} ({})", mentor.name, mentor.id)
    if build_memory:
        _rebuild_memory_now(mentor)


@app.command("rebuild-memory")
def rebuild_memory(
    mentor_id: Annotated[str, typer.Option(help="Whose memory to rebuild.")],
) -> None:
    """Rebuild one mentor's long-term memory from their sources (calls the embeddings API)."""
    from mentor_agent.db.client import MongoRepository
    from mentor_agent.models.mentor_extract import MentorExtract

    repository = MongoRepository(MentorExtract, settings.mongo.MENTORS_COLLECTION)
    mentor = repository.fetch_one({"id": mentor_id})
    if mentor is None:
        typer.echo(f"error: no mentor {mentor_id!r}", err=True)
        raise typer.Exit(code=1)
    _rebuild_memory_now(mentor)


def _rebuild_memory_now(mentor: MentorExtract) -> None:
    from mentor_agent.db.client import MongoRepository
    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.rag.memory.long_term_memory_creator import LongTermMemoryCreator

    repository = MongoRepository(MentorExtract, settings.mongo.MENTORS_COLLECTION)
    repository.collection.update_one({"id": mentor.id}, {"$set": {"memory": "building"}})
    chunks = LongTermMemoryCreator.build().rebuild_one(mentor)
    status = "ready" if chunks else "failed"
    repository.collection.update_one({"id": mentor.id}, {"$set": {"memory": status}})
    logger.info("Memory for {}: {} ({} chunks)", mentor.id, status, chunks)


@app.command("create-memory")
def create_memory(
    sample: Annotated[
        bool, typer.Option(help="Only a few documents per source, for a quick smoke run.")
    ] = False,
) -> None:
    """Extract every mentor's sources and rebuild the long-term memory."""
    from mentor_agent.rag.memory.long_term_memory_creator import LongTermMemoryCreator

    total = LongTermMemoryCreator.build()(sample=sample)
    if total == 0:
        logger.error("No documents were ingested; run `load-mentors` first")
        raise typer.Exit(code=1)


@app.command("delete-memory")
def delete_memory(
    yes: Annotated[bool, typer.Option("--yes", help="Skip the confirmation prompt.")] = False,
) -> None:
    """Delete the long-term memory collection."""
    from mentor_agent.services.maintenance import delete_long_term_memory

    if not yes:
        typer.confirm("Delete the whole long-term memory?", abort=True)
    logger.info("Dropped: {}", delete_long_term_memory() or "nothing to delete")


@app.command("reset-conversations")
def reset_conversations(
    yes: Annotated[bool, typer.Option("--yes", help="Skip the confirmation prompt.")] = False,
) -> None:
    """Delete every conversation's short-term memory."""
    from mentor_agent.services.maintenance import reset_conversation_state

    if not yes:
        typer.confirm("Delete every conversation history?", abort=True)
    logger.info("Dropped: {}", reset_conversation_state() or "nothing to delete")


@app.command("generate-dataset")
def generate_dataset(
    max_samples: Annotated[int, typer.Option(help="Maximum samples to generate.")] = 40,
) -> None:
    """Generate a synthetic evaluation dataset from the mentors' sources."""
    from mentor_agent.evals.generate_dataset import EvaluationDatasetGenerator

    EvaluationDatasetGenerator(max_samples=max_samples)()


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
    from mentor_agent.core.tracing import configure_opik
    from mentor_agent.evals.evaluate import evaluate_agent
    from mentor_agent.evals.upload_dataset import upload_dataset

    if not configure_opik():
        logger.error("Evaluation needs Opik: set COMET_API_KEY")
        raise typer.Exit(code=1)
    evaluate_agent(upload_dataset(name, data_path), workers=workers, nb_samples=nb_samples)


if __name__ == "__main__":
    app()
