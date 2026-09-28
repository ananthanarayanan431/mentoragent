from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class GroqSettings(BaseSettings):
    """Groq inference credentials and model selection.

    Attributes:
        API_KEY: The API key for the Groq service.
        LLM_MODEL: The model used for the main conversation.
        LLM_MODEL_CONTEXT_SUMMARY: The cheaper model used to summarise context.
    """

    model_config = settings_config("GROQ_")

    API_KEY: str
    LLM_MODEL: str = "llama-3.3-70b-versatile"
    LLM_MODEL_CONTEXT_SUMMARY: str = "llama-3.1-8b-instant"


class OpenAISettings(BaseSettings):
    """OpenAI credentials and model selection, required for evaluation.

    Attributes:
        API_KEY: The API key for the OpenAI service.
        LLM_MODEL: The model used for evaluation runs.
    """

    model_config = settings_config("OPENAI_")

    API_KEY: str
    LLM_MODEL: str = "gpt-4o-mini"


class OpenRouterSettings(BaseSettings):
    """OpenRouter credentials and model selection.

    OpenRouter exposes an OpenAI-compatible API, so it is called through the
    vanilla ``openai`` client pointed at ``BASE_URL``.

    Attributes:
        API_KEY: The API key for the OpenRouter service.
        BASE_URL: The OpenAI-compatible endpoint of OpenRouter.
        LLM_MODEL: The default model, as an OpenRouter ``vendor/model`` slug.
        TEMPERATURE: The default sampling temperature.
        APP_URL: Optional site URL sent as ``HTTP-Referer`` for OpenRouter rankings.
        APP_NAME: Optional app name sent as ``X-Title`` for OpenRouter rankings.
    """

    model_config = settings_config("OPENROUTER_")

    API_KEY: str
    BASE_URL: str = "https://openrouter.ai/api/v1"
    LLM_MODEL: str = "openai/gpt-4o-mini"
    TEMPERATURE: float = 0.7
    APP_URL: str | None = None
    APP_NAME: str | None = "mentoragent"
