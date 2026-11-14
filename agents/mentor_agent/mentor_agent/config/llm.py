from __future__ import annotations

from typing import Any

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings

from mentor_agent.config.base import MissingSettingError, OptionalStr, settings_config

# Only the cheap model families are allowed: Haiku for everyday work, Sonnet when a
# route needs more judgment. Opus and Fable are deliberately rejected to keep cost down.
ALLOWED_MODEL_PREFIXES = ("claude-haiku-", "claude-sonnet-")


class AnthropicSettings(BaseSettings):
    """Anthropic (Claude) credentials and model selection for every chat call.

    Sampling parameters (temperature, top_p) are not configurable: current Claude
    models reject non-default values. Thinking is switched off to keep calls cheap.

    Attributes:
        API_KEY: The Anthropic API key.
        LLM_MODEL: Model that plays the mentor; must be a Haiku or Sonnet model.
        LLM_MODEL_CONTEXT_SUMMARY: Model used for conversation and context summaries.
        MAX_TOKENS: Output token cap per call.
        TIMEOUT_SECONDS: Per-request timeout for LLM calls.
        MAX_RETRIES: Retries on transient LLM errors (429, 5xx, timeouts).
    """

    model_config = settings_config("ANTHROPIC_")

    # Blank by default so commands that call no model (and CI's OpenAPI export)
    # load without it; require_api_key() checks it where a model is called.
    API_KEY: SecretStr = SecretStr("")
    LLM_MODEL: str = "claude-haiku-5-5"
    LLM_MODEL_CONTEXT_SUMMARY: str = "claude-haiku-5-5"
    MAX_TOKENS: int = Field(default=4096, gt=0)
    TIMEOUT_SECONDS: float = Field(default=60.0, gt=0)
    MAX_RETRIES: int = Field(default=2, ge=0)

    @field_validator("LLM_MODEL", "LLM_MODEL_CONTEXT_SUMMARY")
    @classmethod
    def check_cheap_model(cls, value: str) -> str:
        """Allow only Haiku and Sonnet models."""
        if not value.startswith(ALLOWED_MODEL_PREFIXES):
            msg = f"{value!r} is not allowed: use a claude-haiku-* or claude-sonnet-* model"
            raise ValueError(msg)
        return value

    def require_api_key(self) -> SecretStr:
        """The key, for code about to call Claude.

        Checked here rather than when settings load, so commands that never call a
        model (load-mentors, reset-conversations) work without one.

        Raises:
            MissingSettingError: If the key is blank (as .env.example ships it).
        """
        if not self.API_KEY.get_secret_value().strip():
            msg = (
                "ANTHROPIC_API_KEY is empty: set it in .env "
                "(keys: https://console.anthropic.com/settings/keys)"
            )
            raise MissingSettingError(msg)
        return self.API_KEY


def thinking_off(model: str) -> dict[str, Any]:
    """The ``thinking`` request value that turns extended thinking off for ``model``.

    Claude Sonnet 5.5 rejects ``{"type": "disabled"}`` and takes
    ``{"type": "between_tools"}`` instead; Haiku and older Sonnets accept ``disabled``.
    """
    if model.startswith("claude-sonnet-5-5"):
        return {"type": "between_tools"}
    return {"type": "disabled"}


class OpenRouterSettings(BaseSettings):
    """OpenRouter credentials, used only for embeddings.

    Anthropic has no embeddings API, so documents and queries are still embedded
    through OpenRouter's OpenAI-compatible endpoint. Chat goes to Anthropic.

    Attributes:
        API_KEY: The API key for the OpenRouter service.
        BASE_URL: The OpenAI-compatible endpoint of OpenRouter.
        TIMEOUT_SECONDS: Per-request timeout for embedding calls.
        MAX_RETRIES: Retries on transient errors (429, 5xx, timeouts).
        APP_URL: Optional site URL sent as ``HTTP-Referer`` for OpenRouter rankings.
        APP_NAME: Optional app name sent as ``X-Title`` for OpenRouter rankings.
    """

    model_config = settings_config("OPENROUTER_")

    API_KEY: SecretStr
    BASE_URL: str = "https://openrouter.ai/api/v1"
    TIMEOUT_SECONDS: float = Field(default=60.0, gt=0)
    MAX_RETRIES: int = Field(default=2, ge=0)
    APP_URL: OptionalStr = None
    APP_NAME: OptionalStr = "mentoragent"

    def require_api_key(self) -> SecretStr:
        """The key, for code about to call OpenRouter.

        Raises:
            MissingSettingError: If the key is blank (as .env.example ships it).
        """
        if not self.API_KEY.get_secret_value().strip():
            msg = "OPENROUTER_API_KEY is empty: set it in .env (keys: https://openrouter.ai/keys)"
            raise MissingSettingError(msg)
        return self.API_KEY

    @property
    def default_headers(self) -> dict[str, str]:
        """Attribution headers OpenRouter uses for its app rankings."""
        headers: dict[str, str] = {}
        if self.APP_URL:
            headers["HTTP-Referer"] = self.APP_URL
        if self.APP_NAME:
            headers["X-Title"] = self.APP_NAME
        return headers
