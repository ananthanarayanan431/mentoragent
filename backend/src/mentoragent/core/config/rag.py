from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class RagSettings(BaseSettings):
    """Embedding model and retrieval tuning.

    Embeddings are served by OpenAI, so ``OpenAISettings.API_KEY`` must be set
    for retrieval to work at all -- there is no local fallback.

    Attributes:
        TEXT_EMBEDDING_MODEL_ID: The OpenAI text embedding model.
        TEXT_EMBEDDING_MODEL_DIM: Output dimension of the embedding model.
            text-embedding-3-small emits 1536 by default and supports
            shortening via the ``dimensions`` request parameter. Whatever
            value is set here must match ``numDimensions`` on the Atlas
            vector search index, or every query errors.
        TOP_K: The number of top results to return.
        CHUNK_SIZE: The chunk size used when splitting documents.
        CHUNK_OVERLAP: The overlap between consecutive chunks.
    """

    model_config = settings_config("RAG_")

    TEXT_EMBEDDING_MODEL_ID: str = "text-embedding-3-small"
    TEXT_EMBEDDING_MODEL_DIM: int = 1536
    TOP_K: int = 3
    CHUNK_SIZE: int = 256
    CHUNK_OVERLAP: int = 10
