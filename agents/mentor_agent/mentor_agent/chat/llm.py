"""LangChain chat models served by Anthropic (Claude Haiku / Sonnet)."""

from __future__ import annotations

from langchain_anthropic import ChatAnthropic

from mentor_agent.config import settings
from mentor_agent.config.llm import thinking_off


def build_chat_model(model: str | None = None) -> ChatAnthropic:
    """Return a Claude chat model with thinking off, to keep calls cheap.

    No temperature is sent: current Claude models reject non-default sampling values.

    Args:
        model: Claude model id. Defaults to ``ANTHROPIC_LLM_MODEL``.
    """
    config = settings.anthropic
    model_name = model or config.LLM_MODEL
    return ChatAnthropic(
        model_name=model_name,
        api_key=config.require_api_key(),
        max_tokens_to_sample=config.MAX_TOKENS,
        timeout=config.TIMEOUT_SECONDS,
        max_retries=config.MAX_RETRIES,
        thinking=thinking_off(model_name),
        stop=None,
    )


def build_summary_model() -> ChatAnthropic:
    """Return the cheaper model used for summaries."""
    return build_chat_model(settings.anthropic.LLM_MODEL_CONTEXT_SUMMARY)
