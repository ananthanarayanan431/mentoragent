from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class RagSettings(BaseSettings):
    
    model_config = settings_config("RAG_")

    TEXT_EMBEDDING_MODEL_ID: str = "text-embedding-3-small"
    TEXT_EMBEDDING_MODEL_DIM: int = 1536
    TOP_K: int = 3
    CHUNK_SIZE: int = 256
    CHUNK_OVERLAP: int = 10
