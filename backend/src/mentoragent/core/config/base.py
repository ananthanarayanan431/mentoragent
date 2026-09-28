from __future__ import annotations

from pathlib import Path
from typing import Annotated

from pydantic import BeforeValidator, SecretStr
from pydantic_settings import SettingsConfigDict

# backend/ - resolved from this file so settings load the same .env no matter
# which directory the process is started from (tests, notebooks, uvicorn).
BACKEND_DIR = Path(__file__).resolve().parents[4]
ENV_FILE = BACKEND_DIR / ".env"


def _blank_to_none(value: object) -> object:
    return None if isinstance(value, str) and not value.strip() else value


# An optional secret where a blank value (``COMET_API_KEY=``) means "unset".
OptionalSecret = Annotated[SecretStr | None, BeforeValidator(_blank_to_none)]
OptionalStr = Annotated[str | None, BeforeValidator(_blank_to_none)]


def settings_config(prefix: str = "") -> SettingsConfigDict:
    """Build the loader config shared by every settings group.

    Args:
        prefix: Environment variable prefix for the group, e.g. ``"MONGO_"``.
            A group declaring ``URI`` under that prefix reads ``MONGO_URI``,
            which keeps ``.env`` flat while the Python side stays nested.

    Returns:
        SettingsConfigDict: The loader config for a settings group.

    Note:
        ``extra="ignore"`` is load-bearing, not cosmetic. pydantic-settings
        defaults to ``extra="forbid"``, so without this every group would
        raise on the *other* groups' variables the moment it read ``.env``.
    """
    return SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        env_prefix=prefix,
        case_sensitive=False,
        extra="ignore",
    )
