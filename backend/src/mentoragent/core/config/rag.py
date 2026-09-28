from __future__ import annotations

from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class RagSettings(BaseSettings):
    """Embedding model and retrieval tuning.

    Attributes:
        TEXT_EMBEDDING_MODEL_ID: OpenRouter embedding model used for documents and queries.
        TEXT_EMBEDDING_MODEL_DIM: Embedding size; must match ``numDimensions``
            on the Atlas vector search index.
        TOP_K: Number of documents returned per query.
        CHUNK_SIZE: Size of each document chunk.
        CHUNK_OVERLAP: Overlap between consecutive chunks.
        VECTOR_INDEX_NAME: Atlas vector search index name.
        FULLTEXT_INDEX_NAME: Atlas Search (full-text) index name.
    """

    model_config = settings_config("RAG_")

    TEXT_EMBEDDING_MODEL_ID: str = "openai/text-embedding-3-small"
    TEXT_EMBEDDING_MODEL_DIM: int = Field(default=1536, gt=0)
    TOP_K: int = Field(default=3, gt=0)
    CHUNK_SIZE: int = Field(default=256, gt=0)
    CHUNK_OVERLAP: int = Field(default=10, ge=0)
    VECTOR_INDEX_NAME: str = "vector_index"
    FULLTEXT_INDEX_NAME: str = "hybrid_search_index"

    @model_validator(mode="after")
    def check_overlap_smaller_than_chunk(self) -> Self:
        """Reject an overlap that would make the splitter loop forever."""
        if self.CHUNK_OVERLAP >= self.CHUNK_SIZE:
            raise ValueError(
                f"RAG_CHUNK_OVERLAP ({self.CHUNK_OVERLAP}) must be smaller than "
                f"RAG_CHUNK_SIZE ({self.CHUNK_SIZE})"
            )
        return self
