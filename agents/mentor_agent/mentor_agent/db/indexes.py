"""Atlas Search index management for the hybrid retriever."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

# A public re-export of pymongo_search_utils, which we do not depend on directly.
from langchain_mongodb.index import (
    create_fulltext_search_index,  # pyright: ignore[reportPrivateImportUsage]
)
from loguru import logger

from mentor_agent.rag.retrievers import vector_collection

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from langchain_mongodb import MongoDBAtlasVectorSearch
    from pymongo.collection import Collection

    from mentor_agent.db.client import MongoDocument


def _index_exists(collection: Collection[MongoDocument], index_name: str) -> bool:
    return any(True for _ in collection.list_search_indexes(index_name))


def _index_definition(
    collection: Collection[MongoDocument], index_name: str
) -> Mapping[str, Any] | None:
    """The latest definition of a search index, or ``None`` when there is none."""
    for index in collection.list_search_indexes(index_name):
        definition: Mapping[str, Any] = index.get("latestDefinition") or {}
        return definition
    return None


def vector_index_matches(
    definition: Mapping[str, Any], embedding_dim: int, filter_fields: Sequence[str]
) -> bool:
    """Whether an existing vector index already has this size and these filters.

    Pure, so it is easy to test. Used to skip the update when nothing changed:
    ``update_search_index`` on a vector index is rejected by some Atlas servers
    (local Atlas answers ``"mappings" is required``), and it would otherwise run
    after every memory build.
    """
    fields: list[Mapping[str, Any]] = definition.get("fields") or []
    dims = {f.get("numDimensions") for f in fields if f.get("type") == "vector"}
    filters = {f.get("path") for f in fields if f.get("type") == "filter"}
    return dims == {embedding_dim} and filters == set(filter_fields)


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
    left alone when its size and filters already match, and otherwise updated
    in place so new ``filter_fields`` take effect; an existing full-text index
    is left untouched.

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
    collection = vector_collection(vectorstore)

    # No public accessor in langchain-mongodb for the index name or text key.
    vector_index = vectorstore._index_name  # pyright: ignore[reportPrivateUsage]
    existing = _index_definition(collection, vector_index)
    if existing is not None and vector_index_matches(existing, embedding_dim, filter_fields):
        logger.debug("Vector search index {!r} is up to date", vector_index)
    else:
        vectorstore.create_vector_search_index(  # pyright: ignore[reportUnknownMemberType]
            dimensions=embedding_dim,
            filters=list(filter_fields),
            update=existing is not None,
            wait_until_complete=wait_until_complete,
        )
        action = "Updated" if existing is not None else "Created"
        logger.info("{} vector search index {!r}", action, vector_index)

    if fulltext_index is None:
        return

    if _index_exists(collection, fulltext_index):
        logger.info("Full-text search index {!r} already exists", fulltext_index)
        return

    create_fulltext_search_index(
        collection=collection,
        field=vectorstore._text_key,  # pyright: ignore[reportPrivateUsage]
        index_name=fulltext_index,
        wait_until_complete=wait_until_complete,
    )
    logger.info("Created full-text search index {!r}", fulltext_index)
