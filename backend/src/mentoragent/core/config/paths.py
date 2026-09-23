from pathlib import Path

from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class PathSettings(BaseSettings):
    """On-disk data file locations.

    Attributes:
        EXTRACTION_METADATA_FILE_PATH: Path to the extraction metadata file.
        EVALUATION_DATASET_FILE_PATH: Path to the evaluation dataset file.
    """

    model_config = settings_config()

    EXTRACTION_METADATA_FILE_PATH: Path = Path("data/extraction_metadata.json")
    EVALUATION_DATASET_FILE_PATH: Path = Path("data/evaluation_dataset.json")
