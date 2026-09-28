from loguru import logger
from mentoragents.evaluation.generate_dataset import EvaluationDatasetGenerator
import click

@click.command()
@click.option(
    "--temperature",
    type = float,
    default = 0.9,
    help = "Temperature for the LLM.",
)

@click.option(
    "--max-samples",
    type = int,
    default = 40,
    help = "Maximum number of samples to generate.",
)
def main(temperature : float, max_samples : int) -> None:
    """
    Generates an evaluation dataset for mentor.

    Args:
        temperature : Temperature for the LLM.
        max_samples : Maximum number of samples to generate.
    """
    logger.info(f"Generating evaluation dataset with temperature {temperature} and max samples {max_samples}")
    evaluation_dataset_generator = EvaluationDatasetGenerator(temperature = temperature, max_samples = max_samples)
    evaluation_dataset_generator()
    
if __name__ == "__main__":
    main()