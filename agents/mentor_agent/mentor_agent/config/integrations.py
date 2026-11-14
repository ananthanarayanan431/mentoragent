from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings

from mentor_agent.config.base import OptionalSecret, OptionalStr, settings_config


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


class FirecrawlSettings(BaseSettings):
    """Firecrawl credentials, used to read web pages for a mentor's memory.

    Optional: without a key, pages are read with a plain fetch. With one, each page
    is read as its main content (no menus or footers), which retrieves better.

    Attributes:
        API_KEY: The Firecrawl API key.
        BASE_URL: The Firecrawl API endpoint.
        TIMEOUT_SECONDS: Timeout for reading one page.
    """

    model_config = settings_config("FIRECRAWL_")

    API_KEY: OptionalSecret = None
    BASE_URL: str = "https://api.firecrawl.dev"
    TIMEOUT_SECONDS: float = Field(default=60.0, gt=0)


class ExaSettings(BaseSettings):
    """Exa search credentials, used when researching a custom mentor.

    Optional: without a key, research runs on Claude's web search alone. Exa adds
    text from pages the server cannot read itself, such as LinkedIn profiles.

    Attributes:
        API_KEY: The Exa API key.
        BASE_URL: The Exa API endpoint.
        TIMEOUT_SECONDS: Timeout for one Exa search.
        RESULTS_PER_SEARCH: Results kept from each search (each one is billed).
    """

    model_config = settings_config("EXA_")

    API_KEY: OptionalSecret = None
    BASE_URL: str = "https://api.exa.ai"
    TIMEOUT_SECONDS: float = Field(default=30.0, gt=0)
    RESULTS_PER_SEARCH: int = Field(default=3, ge=1, le=10)
