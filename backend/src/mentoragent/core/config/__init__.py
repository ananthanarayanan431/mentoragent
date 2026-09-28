"""Application settings, split into one class per concern.

Each group is a standalone ``BaseSettings`` that can be instantiated on its
own, which is the point of the split: to debug MongoDB configuration you
import ``MongoSettings`` and construct it, instead of building the whole
application config and reading one attribute off it.

    >>> from mentoragent.core.config import MongoSettings
    >>> MongoSettings()
    MongoSettings(URI='mongodb://...', DB_NAME='mentoragents', ...)

Normal application code uses the composed singleton::

    from mentoragent.core.config import settings

    settings.mongo.URI
    settings.openrouter.LLM_MODEL
"""

from __future__ import annotations

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings

from mentoragent.core.config.agent import AgentSettings
from mentoragent.core.config.app import AppSettings, ServerSettings
from mentoragent.core.config.base import ENV_FILE, settings_config
from mentoragent.core.config.cors import CorsSettings
from mentoragent.core.config.integrations import (
    ArcadeSettings,
    CometSettings,
    LangSmithSettings,
)
from mentoragent.core.config.llm import OpenRouterSettings
from mentoragent.core.config.mongo import MongoSettings
from mentoragent.core.config.paths import PathSettings
from mentoragent.core.config.rag import RagSettings

# Also export the variables into os.environ: LangChain and LangSmith read
# LANGSMITH_* straight from the process environment, not through Settings.
# override=False: real environment variables (e.g. from the deployment
# platform) always win over the file.
load_dotenv(ENV_FILE, override=False)


class Settings(BaseSettings):
    """Every settings group, composed into one object.

    Attributes:
        app: Project identity and deployment environment.
        server: Uvicorn / FastAPI bind settings.
        cors: Extra browser origins allowed to call the API.
        mongo: MongoDB connection and collection names.
        openrouter: OpenRouter credentials and model selection.
        agent: Conversation behaviour and limits.
        rag: Embedding model and retrieval tuning.
        arcade: Arcade tool-calling credentials.
        langsmith: LangSmith tracing configuration.
        comet: Comet ML and Opik configuration.
        paths: On-disk data file locations.
    """

    model_config = settings_config()

    # default_factory rather than a plain instance: the groups are then built
    # when Settings() runs, so a bad .env raises at construction instead of at
    # import time, and tests can swap os.environ before instantiating.
    app: AppSettings = Field(default_factory=AppSettings)
    server: ServerSettings = Field(default_factory=ServerSettings)
    cors: CorsSettings = Field(default_factory=CorsSettings)
    mongo: MongoSettings = Field(default_factory=MongoSettings)
    openrouter: OpenRouterSettings = Field(default_factory=OpenRouterSettings)
    agent: AgentSettings = Field(default_factory=AgentSettings)
    rag: RagSettings = Field(default_factory=RagSettings)
    arcade: ArcadeSettings = Field(default_factory=ArcadeSettings)
    langsmith: LangSmithSettings = Field(default_factory=LangSmithSettings)
    comet: CometSettings = Field(default_factory=CometSettings)
    paths: PathSettings = Field(default_factory=PathSettings)


settings = Settings()

__all__ = [
    "AgentSettings",
    "AppSettings",
    "ArcadeSettings",
    "CometSettings",
    "CorsSettings",
    "LangSmithSettings",
    "MongoSettings",
    "OpenRouterSettings",
    "PathSettings",
    "RagSettings",
    "ServerSettings",
    "Settings",
    "settings",
]
