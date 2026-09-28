"""Embedding model, served through OpenRouter's OpenAI-compatible API."""

from __future__ import annotations

from functools import lru_cache

from langchain_openai import OpenAIEmbeddings
from loguru import logger

from mentoragent.core.config import settings


@lru_cache(maxsize=4)
def build_embedding_model(model_name: str | None = None) -> OpenAIEmbeddings:
    """Return an embedding model; cached, so the HTTP client is reused.

    Args:
        model_name: OpenRouter embedding model slug, e.g.
            ``"openai/text-embedding-3-small"``. Defaults to
            ``RAG_TEXT_EMBEDDING_MODEL_ID``. Its output size must match
            ``RAG_TEXT_EMBEDDING_MODEL_DIM`` and the Atlas vector index.
    """
    config = settings.openrouter
    model_name = model_name or settings.rag.TEXT_EMBEDDING_MODEL_ID
    logger.info("Initialising embedding model {} via OpenRouter", model_name)

    return OpenAIEmbeddings(
        model=model_name,
        openai_api_key=config.API_KEY,
        openai_api_base=config.BASE_URL,
        default_headers=config.default_headers,
        request_timeout=config.TIMEOUT_SECONDS,
        max_retries=config.MAX_RETRIES,
        # Send raw strings. The default pre-tokenizes input with tiktoken and
        # sends token IDs, which only OpenAI's own endpoint accepts.
        check_embedding_ctx_length=False,
    )
