from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings

from mentor_agent.config.base import AGENT_DIR, settings_config


class PathSettings(BaseSettings):
    """On-disk data file locations.

    Relative paths are resolved against the agent directory, so they point
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
    def resolve_relative_to_agent_dir(cls, v: Path) -> Path:
        """Anchor relative paths at the agent directory."""
        return v if v.is_absolute() else AGENT_DIR / v
