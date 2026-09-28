from pathlib import Path
from mentoragents.evaluation.upload_dataset import upload_dataset
from mentoragents.evaluation.evaluate import evaluate_agent
import click 
from mentoragents.core.config import settings
from mentoragents.infra.opik_utils import configure_opik
import asyncio
import os

@click.command()
@click.option(
    "--name", default="philoagents_evaluation_dataset", help="Name of the dataset"
)
@click.option(
    "--data-path",
    type=click.Path(exists=True, path_type=Path),
    default=settings.EVALUATION_DATASET_FILE_PATH,
    help="Path to the dataset file",
)
@click.option("--workers", default=1, type=int, help="Number of workers")
@click.option(
    "--nb-samples", default=20, type=int, help="Number of samples to evaluate"
)
def main(name: str, data_path: Path, workers: int, nb_samples: int) -> None:
    """
    Evaluate an langgraph agent on a evaluation dataset.

    Args:
        name: Name of the dataset
        data_path: Path to the dataset file
        workers: Number of workers to use for evaluation
        nb_samples: Number of samples to evaluate
    """
    assert settings.COMET_API_KEY, "COMET_API_KEY is not set. We need it to track the experiment with Opik."
    os.environ["OPIK_PROJECT_NAME"] = settings.COMET_PROJECT
    configure_opik()
    dataset = upload_dataset(name=name, data_path=data_path)
    evaluate_agent(dataset, workers=workers, nb_samples=nb_samples)


if __name__ == "__main__":
    main()