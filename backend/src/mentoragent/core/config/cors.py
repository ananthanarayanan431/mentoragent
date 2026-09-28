from __future__ import annotations

from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode

from mentoragent.core.config.base import settings_config


class CorsSettings(BaseSettings):
    """Extra browser origins allowed to call the API.

    Attributes:
        ADDITIONAL_CORS_ORIGINS: Origins beyond the built-in defaults.
    """

    model_config = settings_config()

    # NoDecode turns off the JSON pre-parse pydantic-settings applies to
    # complex types. Without it a plain value like "http://localhost:3000"
    # raises before the validator below ever runs.
    ADDITIONAL_CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(default_factory=list)

    @field_validator("ADDITIONAL_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str] | None) -> list[str]:
        """Parse CORS origins, supporting both comma and semicolon separators.

        Args:
            v: The CORS origins string or list.

        Returns:
            list[str]: The parsed list of CORS origins, empty when unset.
        """
        if v is None:
            return []
        if isinstance(v, list):
            return v

        separator = ";" if ";" in v else ","
        return [origin.strip() for origin in v.split(separator) if origin.strip()]
