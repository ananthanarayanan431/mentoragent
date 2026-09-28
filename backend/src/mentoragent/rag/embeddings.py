from __future__ import annotations

from langchain_openai import OpenAIEmbeddings
from loguru import logger

from mentoragent.core.config import settings


class Embeddings:
    """
    A class that embeds text into a vector space with OpenAI embedding models.
    """

    def __init__(
        self,
        model_name: str = settings.rag.TEXT_EMBEDDING_MODEL_ID,
        dimensions: int = settings.rag.TEXT_EMBEDDING_MODEL_DIM,
    ):
        """
        Initializes the Embeddings with a given model name and output size.

        Args:
            model_name: OpenAI embedding model, e.g. ``"text-embedding-3-small"``.
            dimensions: Embedding size. Must match ``numDimensions`` on the
                Atlas vector search index.
        """
        self.model_name = model_name
        self.dimensions = dimensions

    def get_openai_model(self) -> OpenAIEmbeddings:
        """
        Returns an OpenAIEmbeddings object that embeds text into a vector space.
        """
        logger.info(
            f"Initializing OpenAIEmbeddings with model name: {self.model_name} "
            f"and dimensions: {self.dimensions}"
        )
        return OpenAIEmbeddings(
            model=self.model_name,
            api_key=settings.openai.API_KEY,
            # Only the text-embedding-3 family accepts a custom output size;
            # older models such as ada-002 reject the parameter.
            dimensions=self.dimensions if self.model_name.startswith("text-embedding-3") else None,
        )
