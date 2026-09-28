"""LangChain chat models served through OpenRouter."""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from mentoragent.core.config import settings


def build_chat_model(model: str | None = None, temperature: float | None = None) -> ChatOpenAI:
    """Return a chat model pointed at OpenRouter's OpenAI-compatible API.

    Args:
        model: OpenRouter model slug. Defaults to ``OPENROUTER_LLM_MODEL``.
        temperature: Sampling temperature. Defaults to ``OPENROUTER_TEMPERATURE``.
    """
    config = settings.openrouter
    return ChatOpenAI(
        model=model or config.LLM_MODEL,
        api_key=config.API_KEY,
        base_url=config.BASE_URL,
        default_headers=config.default_headers,
        temperature=config.TEMPERATURE if temperature is None else temperature,
        timeout=config.TIMEOUT_SECONDS,
        max_retries=config.MAX_RETRIES,
    )


def build_summary_model() -> ChatOpenAI:
    """Return the cheaper, deterministic model used for summaries."""
    return build_chat_model(settings.openrouter.LLM_MODEL_CONTEXT_SUMMARY, temperature=0.0)
