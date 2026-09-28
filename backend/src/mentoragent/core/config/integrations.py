from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings

from mentoragent.core.config.base import OptionalSecret, OptionalStr, settings_config


class ArcadeSettings(BaseSettings):
    """Arcade tool-calling credentials, used to fetch tweets during ingestion.

    Optional: without them the Twitter extractor is skipped.

    Attributes:
        API_KEY: The API key for the Arcade services.
        USER_ID: The user ID the Arcade tools act on behalf of.
    """

    model_config = settings_config("ARCADE_")

    API_KEY: OptionalSecret = None
    USER_ID: OptionalStr = None

    @property
    def is_configured(self) -> bool:
        return self.API_KEY is not None and bool(self.USER_ID)


class LangSmithSettings(BaseSettings):
    """LangSmith tracing configuration.

    LangChain reads these straight from the process environment (``.env`` is
    exported at start-up); they are declared here for validation and docs.

    Attributes:
        API_KEY: The API key for the LangSmith services.
        TRACING: Whether to enable tracing.
        ENDPOINT: The LangSmith API endpoint.
        PROJECT: The LangSmith project name.
    """

    model_config = settings_config("LANGSMITH_")

    API_KEY: OptionalSecret = None
    TRACING: bool = False
    ENDPOINT: str = "https://api.smith.langchain.com"
    PROJECT: str = "mentoragents"


class CometSettings(BaseSettings):
    """Comet ML and Opik configuration. Optional: tracing is off without a key.

    Attributes:
        API_KEY: The API key for the Comet ML and Opik services.
        PROJECT: The project name for Comet ML and Opik tracking.
    """

    model_config = settings_config("COMET_")

    API_KEY: OptionalSecret = Field(
        default=None, description="API key for Comet ML and Opik services."
    )
    PROJECT: str = Field(
        default="mentor_agents",
        description="Project name for Comet ML and Opik tracking.",
    )

    @property
    def is_configured(self) -> bool:
        return self.API_KEY is not None
