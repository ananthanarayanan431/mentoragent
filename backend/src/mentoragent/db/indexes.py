"""Atlas Search index management for the hybrid retriever."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_mongodb.index import create_fulltext_search_index
from loguru import logger

if TYPE_CHECKING:
    from langchain_mongodb.retrievers import MongoDBAtlasHybridSearchRetriever
    from pymongo.collection import Collection


def _index_exists(collection: Collection, index_name: str) -> bool:
    return any(True for _ in collection.list_search_indexes(index_name))


def create_search_indexes(
    retriever: MongoDBAtlasHybridSearchRetriever,
    embedding_dim: int,
    *,
    include_fulltext: bool = True,
    wait_until_complete: float | None = None,
) -> None:
    """Create the vector (and optionally full-text) indexes the retriever queries.

    Idempotent: an index that already exists is left untouched, so this is
    safe to run on every ingestion.

    Args:
        retriever: The hybrid retriever whose vector store owns the collection.
        embedding_dim: Embedding size; must match the embedding model.
        include_fulltext: Also create the Atlas Search full-text index needed
            for the keyword half of hybrid search.
        wait_until_complete: Seconds to wait for each index to become queryable
            before raising ``TimeoutError``. ``None`` returns immediately.
    """
    vectorstore = retriever.vectorstore
    collection = vectorstore.collection

    vector_index = vectorstore._index_name  # no public accessor in langchain-mongodb
    if _index_exists(collection, vector_index):
        logger.info("Vector search index {!r} already exists", vector_index)
    else:
        vectorstore.create_vector_search_index(
            dimensions=embedding_dim, wait_until_complete=wait_until_complete
        )
        logger.info("Created vector search index {!r}", vector_index)

    if not include_fulltext:
        return

    fulltext_index = retriever.search_index_name
    if _index_exists(collection, fulltext_index):
        logger.info("Full-text search index {!r} already exists", fulltext_index)
        return

    create_fulltext_search_index(
        collection=collection,
        field=vectorstore._text_key,  # no public accessor in langchain-mongodb
        index_name=fulltext_index,
        wait_until_complete=wait_until_complete,
    )
    logger.info("Created full-text search index {!r}", fulltext_index)
