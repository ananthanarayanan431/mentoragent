from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings

from mentoragent.core.config.base import BACKEND_DIR, settings_config


class PathSettings(BaseSettings):
    """On-disk data file locations.

    Relative paths are resolved against the backend directory, so they point
    at the same file regardless of the process working directory.

    Attributes:
        EXTRACTION_METADATA_FILE_PATH: JSON file listing mentors and their sources.
        EVALUATION_DATASET_FILE_PATH: Where the generated evaluation dataset is written.
    """

    model_config = settings_config()

    EXTRACTION_METADATA_FILE_PATH: Path = Path("data/extraction_metadata.json")
    EVALUATION_DATASET_FILE_PATH: Path = Path("data/evaluation_dataset.json")

    @field_validator("*")
    @classmethod
    def resolve_relative_to_backend(cls, v: Path) -> Path:
        """Anchor relative paths at the backend directory."""
        return v if v.is_absolute() else BACKEND_DIR / v
