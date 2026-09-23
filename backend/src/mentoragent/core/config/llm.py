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
