"""Hybrid (vector + full-text) retrieval over the long-term memory collection."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_mongodb.retrievers import MongoDBAtlasHybridSearchRetriever

from mentoragent.core.config import settings
from mentoragent.db.client import get_mongo_client
from mentoragent.rag.embeddings import build_embedding_model

if TYPE_CHECKING:
    from langchain_core.embeddings import Embeddings
    from pymongo import MongoClient

# Field names inside each long-term memory document.
TEXT_KEY = "chunk"
EMBEDDING_KEY = "embedding"


def build_vector_store(
    embedding: Embeddings | None = None, client: MongoClient | None = None
) -> MongoDBAtlasVectorSearch:
    """Return the vector store over ``MONGO_LONG_TERM_MEMORY_COLLECTION``.

    Uses the shared MongoDB client, so building it is cheap and opens no new
    connection pool.
    """
    client = client or get_mongo_client()
    collection = client[settings.mongo.DB_NAME][settings.mongo.LONG_TERM_MEMORY_COLLECTION]
    return MongoDBAtlasVectorSearch(
        collection=collection,
        embedding=embedding or build_embedding_model(),
        index_name=settings.rag.VECTOR_INDEX_NAME,
        text_key=TEXT_KEY,
        embedding_key=EMBEDDING_KEY,
        relevance_score_fn="dotProduct",
    )


def build_hybrid_retriever(
    vectorstore: MongoDBAtlasVectorSearch,
    mentor_id: str | None = None,
    k: int | None = None,
) -> MongoDBAtlasHybridSearchRetriever:
    """Return a hybrid retriever, optionally restricted to one mentor's documents.

    Args:
        vectorstore: The long-term memory vector store.
        mentor_id: Only return documents extracted for this mentor. Without
            it, results can mix every mentor's sources.
        k: Number of documents returned. Defaults to ``RAG_TOP_K``.
    """
    return MongoDBAtlasHybridSearchRetriever(
        vectorstore=vectorstore,
        search_index_name=settings.rag.FULLTEXT_INDEX_NAME,
        k=k or settings.rag.TOP_K,
        pre_filter={"mentor_id": {"$eq": mentor_id}} if mentor_id else None,
        vector_penalty=50,
        fulltext_penalty=50,
    )
