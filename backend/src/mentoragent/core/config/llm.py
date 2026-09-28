from __future__ import annotations

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings

from mentoragent.core.config.base import OptionalStr, settings_config


class OpenRouterSettings(BaseSettings):
    """OpenRouter credentials and model selection.

    OpenRouter exposes an OpenAI-compatible API, so chat and embedding models
    are called through the ``openai`` / ``langchain-openai`` clients pointed at
    ``BASE_URL``.

    Attributes:
        API_KEY: The API key for the OpenRouter service.
        BASE_URL: The OpenAI-compatible endpoint of OpenRouter.
        LLM_MODEL: Model used for the mentor conversation, as a ``vendor/model`` slug.
        LLM_MODEL_CONTEXT_SUMMARY: Cheaper model used for summaries.
        TEMPERATURE: Sampling temperature for the conversation model.
        TIMEOUT_SECONDS: Per-request timeout for LLM calls.
        MAX_RETRIES: Retries on transient LLM errors (429, 5xx, timeouts).
        APP_URL: Optional site URL sent as ``HTTP-Referer`` for OpenRouter rankings.
        APP_NAME: Optional app name sent as ``X-Title`` for OpenRouter rankings.
    """

    model_config = settings_config("OPENROUTER_")

    API_KEY: SecretStr
    BASE_URL: str = "https://openrouter.ai/api/v1"
    LLM_MODEL: str = "openai/gpt-4o-mini"
    LLM_MODEL_CONTEXT_SUMMARY: str = "openai/gpt-4o-mini"
    TEMPERATURE: float = Field(default=0.7, ge=0.0, le=2.0)
    TIMEOUT_SECONDS: float = Field(default=60.0, gt=0)
    MAX_RETRIES: int = Field(default=2, ge=0)
    APP_URL: OptionalStr = None
    APP_NAME: OptionalStr = "mentoragent"

    @property
    def default_headers(self) -> dict[str, str]:
        """Attribution headers OpenRouter uses for its app rankings."""
        headers: dict[str, str] = {}
        if self.APP_URL:
            headers["HTTP-Referer"] = self.APP_URL
        if self.APP_NAME:
            headers["X-Title"] = self.APP_NAME
        return headers
