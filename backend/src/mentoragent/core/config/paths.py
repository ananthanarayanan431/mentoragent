from pathlib import Path

from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class PathSettings(BaseSettings):

    model_config = settings_config()

    EXTRACTION_METADATA_FILE_PATH: Path = Path("data/extraction_metadata.json")
    EVALUATION_DATASET_FILE_PATH: Path = Path("data/evaluation_dataset.json")
