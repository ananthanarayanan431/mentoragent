from __future__ import annotations

import os
from pathlib import Path
from typing import Annotated

from pydantic import BeforeValidator, SecretStr
from pydantic_settings import SettingsConfigDict

# The agent's folder: where .env and data/ live. Relative data paths resolve against
# it, so settings load the same files whatever directory the process starts from.
#
# From a source checkout it is found from this file (agents/mentor_agent; keep the
# parents index in step with this file's depth). An installed package (the Docker
# image) lives in site-packages instead, so the image sets MENTOR_AGENT_DIR=/app.
AGENT_DIR = Path(os.environ.get("MENTOR_AGENT_DIR") or Path(__file__).resolve().parents[2])
ENV_FILE = AGENT_DIR / ".env"


def _blank_to_none(value: object) -> object:
    return None if isinstance(value, str) and not value.strip() else value


# An optional secret where a blank value (``COMET_API_KEY=``) means "unset".
OptionalSecret = Annotated[SecretStr | None, BeforeValidator(_blank_to_none)]
OptionalStr = Annotated[str | None, BeforeValidator(_blank_to_none)]
# An optional integer where a blank value (``MONGO_CONVERSATION_TTL_SECONDS=``) means "unset".
OptionalInt = Annotated[int | None, BeforeValidator(_blank_to_none)]


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
