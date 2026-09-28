from __future__ import annotations

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class ArcadeSettings(BaseSettings):
    """Arcade tool-calling credentials.

    Attributes:
        API_KEY: The API key for the Arcade services.
        USER_ID: The user ID the Arcade tools act on behalf of.
    """

    model_config = settings_config("ARCADE_")

    API_KEY: SecretStr
    USER_ID: str


class LangSmithSettings(BaseSettings):
    """LangSmith tracing configuration.

    Attributes:
        API_KEY: The API key for the LangSmith services.
        TRACING: Whether to enable tracing.
        ENDPOINT: The LangSmith API endpoint.
        PROJECT: The LangSmith project name.
    """

    model_config = settings_config("LANGSMITH_")

    API_KEY: SecretStr
    TRACING: bool = True
    ENDPOINT: str = "https://api.smith.langchain.com"
    PROJECT: str = "mentoragents"


class CometSettings(BaseSettings):
    """Comet ML and Opik configuration.

    Attributes:
        API_KEY: The API key for the Comet ML and Opik services.
        PROJECT: The project name for Comet ML and Opik tracking.
    """

    model_config = settings_config("COMET_")

    API_KEY: SecretStr | None = Field(
        default=None, description="API key for Comet ML and Opik services."
    )
    PROJECT: str = Field(
        default="mentor_agents",
        description="Project name for Comet ML and Opik tracking.",
    )
