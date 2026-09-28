from __future__ import annotations

from typing import TYPE_CHECKING

from mentoragent.core.config import settings
from mentoragent.rag.retrievers import Retriever

if TYPE_CHECKING:
    from langchain_core.documents import Document
    from langchain_mongodb.retrievers import MongoDBAtlasHybridSearchRetriever


class LongTermMemoryRetriever:
    """Query the mentors' long-term memory with hybrid (vector + keyword) search.

    Args:
        retriever: The configured hybrid retriever; use :meth:`build` for defaults.
    """

    def __init__(self, retriever: MongoDBAtlasHybridSearchRetriever) -> None:
        self.retriever = retriever

    @classmethod
    def build(cls) -> LongTermMemoryRetriever:
        """Create an instance wired from settings."""
        retriever = Retriever(
            embedding_model_id=settings.rag.TEXT_EMBEDDING_MODEL_ID,
            k=settings.rag.TOP_K,
        ).get_hybrid_search_mongodb_retriever()
        return cls(retriever)

    def __call__(self, query: str) -> list[Document]:
        """Return the documents most relevant to ``query``."""
        return self.retriever.invoke(query)

    async def ainvoke(self, query: str) -> list[Document]:
        """Async variant of :meth:`__call__`, for use inside the async graph."""
        return await self.retriever.ainvoke(query)
