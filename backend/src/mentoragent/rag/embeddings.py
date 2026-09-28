from __future__ import annotations

from langchain_openai import OpenAIEmbeddings
from loguru import logger

from mentoragent.core.config import settings


class Embeddings:
    """
    A class that embeds text into a vector space through OpenRouter.

    OpenRouter serves embedding models behind the same OpenAI-compatible API
    used for chat, so this reuses the OpenRouter key and base URL.
    """

    def __init__(self, model_name: str = settings.rag.TEXT_EMBEDDING_MODEL_ID):
        """
        Initializes the Embeddings with a given model name.

        Args:
            model_name: OpenRouter embedding model slug, e.g.
                ``"openai/text-embedding-3-small"``. Its output size must match
                ``RAG_TEXT_EMBEDDING_MODEL_DIM`` and the Atlas vector index.
        """
        self.model_name = model_name

    def get_openai_model(self) -> OpenAIEmbeddings:
        """
        Returns an OpenAIEmbeddings object that embeds text via OpenRouter.
        """
        logger.info(f"Initializing OpenAIEmbeddings via OpenRouter with model name: {self.model_name}")
        config = settings.openrouter
        headers = {}
        if config.APP_URL:
            headers["HTTP-Referer"] = config.APP_URL
        if config.APP_NAME:
            headers["X-Title"] = config.APP_NAME

        return OpenAIEmbeddings(
            model=self.model_name,
            api_key=config.API_KEY,
            base_url=config.BASE_URL,
            default_headers=headers,
            # Send raw strings. The default pre-tokenizes input with tiktoken and
            # sends token IDs, which only OpenAI's own endpoint accepts.
            check_embedding_ctx_length=False,
        )
