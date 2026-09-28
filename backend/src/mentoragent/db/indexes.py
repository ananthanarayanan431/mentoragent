"""Atlas Search index management for the hybrid retriever."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_mongodb.index import create_fulltext_search_index
from loguru import logger

if TYPE_CHECKING:
    from collections.abc import Sequence

    from langchain_mongodb import MongoDBAtlasVectorSearch
    from pymongo.collection import Collection


def _index_exists(collection: Collection, index_name: str) -> bool:
    return any(True for _ in collection.list_search_indexes(index_name))


def create_search_indexes(
    vectorstore: MongoDBAtlasVectorSearch,
    embedding_dim: int,
    *,
    fulltext_index: str | None = None,
    filter_fields: Sequence[str] = ("mentor_id",),
    wait_until_complete: float | None = None,
) -> None:
    """Create or update the vector (and optionally full-text) search indexes.

    Idempotent: safe to run on every ingestion. An existing vector index is
    updated in place so new ``filter_fields`` take effect; an existing
    full-text index is left untouched.

    Args:
        vectorstore: The vector store that owns the collection.
        embedding_dim: Embedding size; must match the embedding model.
        fulltext_index: Name of the Atlas Search full-text index used by the
            keyword half of hybrid search; ``None`` skips it.
        filter_fields: Metadata fields declared as vector-search filters, so
            queries can be restricted to one mentor.
        wait_until_complete: Seconds to wait for each index to become queryable
            before raising ``TimeoutError``. ``None`` returns immediately.
    """
    collection = vectorstore.collection

    vector_index = vectorstore._index_name  # no public accessor in langchain-mongodb
    exists = _index_exists(collection, vector_index)
    vectorstore.create_vector_search_index(
        dimensions=embedding_dim,
        filters=list(filter_fields),
        update=exists,
        wait_until_complete=wait_until_complete,
    )
    logger.info("{} vector search index {!r}", "Updated" if exists else "Created", vector_index)

    if fulltext_index is None:
        return

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
