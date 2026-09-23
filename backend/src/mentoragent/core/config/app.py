from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class AppSettings(BaseSettings):
    """Project identity and deployment environment.

    Attributes:
        PROJECT_NAME: The name of the project.
        APP_VERSION: The running version of the application.
        ENVIRONMENT: The deployment environment (local, dev, test, prod).
        LOCAL_DEVELOPMENT: Whether the application is running locally.
        DEBUG: Whether debug behaviour is enabled.
    """

    model_config = settings_config()

    PROJECT_NAME: str = "MentorAgents"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "local"
    LOCAL_DEVELOPMENT: bool = False
    DEBUG: bool = False


class ServerSettings(BaseSettings):
    """Uvicorn / FastAPI bind settings.

    Attributes:
        HOST: The interface the server binds to.
        PORT: The port the server listens on.
        RELOAD: Whether to enable autoreload.
    """

    model_config = settings_config()

    HOST: str = "0.0.0.0"
    PORT: int = 8000
    RELOAD: bool = True
