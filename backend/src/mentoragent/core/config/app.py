from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings

from mentoragent.core.config.base import OptionalSecret, settings_config

Environment = Literal["local", "dev", "test", "staging", "prod"]


class AppSettings(BaseSettings):
    """Project identity and deployment environment.

    Attributes:
        PROJECT_NAME: The name of the project.
        APP_VERSION: The running version of the application.
        ENVIRONMENT: The deployment environment.
        LOCAL_DEVELOPMENT: Whether the application is running locally.
        DEBUG: Whether debug behaviour is enabled.
        LOG_LEVEL: Minimum level emitted by the logger.
        LOG_JSON: Emit one JSON object per line (for log shippers) instead of
            the coloured human-readable format.
        API_KEY: When set, every API call must send it in the ``X-API-Key``
            header (WebSocket: ``api_key`` query parameter).
    """

    model_config = settings_config()

    PROJECT_NAME: str = "MentorAgents"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: Environment = "local"
    LOCAL_DEVELOPMENT: bool = False
    DEBUG: bool = False
    LOG_LEVEL: Literal["TRACE", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    LOG_JSON: bool = False
    API_KEY: OptionalSecret = None

    @property
    def is_production(self) -> bool:
        """Whether the app runs in production."""
        return self.ENVIRONMENT == "prod"


class ServerSettings(BaseSettings):
    """Uvicorn / FastAPI bind settings.

    Attributes:
        HOST: The interface the server binds to.
        PORT: The port the server listens on.
        RELOAD: Whether to enable autoreload.
    """

    model_config = settings_config()

    HOST: str = "0.0.0.0"
    PORT: int = Field(default=8000, ge=1, le=65535)
    RELOAD: bool = False
