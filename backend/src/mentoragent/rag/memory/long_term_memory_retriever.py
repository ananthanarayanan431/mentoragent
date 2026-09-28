from __future__ import annotations

from typing import TYPE_CHECKING

from mentoragent.rag.retrievers import build_hybrid_retriever, build_vector_store

if TYPE_CHECKING:
    from langchain_core.documents import Document
    from langchain_mongodb import MongoDBAtlasVectorSearch


class LongTermMemoryRetriever:
    """Query the mentors' long-term memory with hybrid (vector + keyword) search.

    Holds one vector store and builds a cheap, mentor-scoped retriever per
    query, so a single instance serves every mentor.

    Args:
        vectorstore: The long-term memory vector store; use :meth:`build`
            for the configured default.
    """

    def __init__(self, vectorstore: MongoDBAtlasVectorSearch) -> None:
        self.vectorstore = vectorstore

    @classmethod
    def build(cls) -> LongTermMemoryRetriever:
        """Create an instance wired from settings."""
        return cls(build_vector_store())

    async def search(self, query: str, mentor_id: str | None = None) -> list[Document]:
        """Return the documents most relevant to ``query``.

        Args:
            query: Free-text query.
            mentor_id: Restrict results to this mentor's sources.
        """
        retriever = build_hybrid_retriever(self.vectorstore, mentor_id=mentor_id)
        return await retriever.ainvoke(query)
