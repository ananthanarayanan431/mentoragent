"""MongoDB access.

``MongoClient`` is a thread-safe connection pool meant to be created once per
process, so :func:`get_mongo_client` hands out a single cached instance and
:class:`MongoRepository` borrows it rather than opening its own.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING, Any, Generic, TypeVar

from bson import ObjectId
from loguru import logger
from pydantic import BaseModel
from pymongo import MongoClient
from pymongo.server_api import ServerApi

from mentoragent.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

    from pymongo.collection import Collection

T = TypeVar("T", bound=BaseModel)

MongoDocument = dict[str, Any]


@lru_cache(maxsize=1)
def get_mongo_client() -> MongoClient[MongoDocument]:
    """Return the process-wide MongoDB client, connecting on first use.

    Raises:
        pymongo.errors.PyMongoError: If the server cannot be reached.
    """
    client: MongoClient[MongoDocument] = MongoClient(settings.mongo.URI, server_api=ServerApi("1"))
    try:
        client.admin.command("ping")
    except Exception:
        client.close()
        logger.exception("Failed to connect to MongoDB")
        raise
    logger.info("Connected to MongoDB")
    return client


def close_mongo_client() -> None:
    """Close the shared client. Call once on application shutdown."""
    if get_mongo_client.cache_info().currsize:
        get_mongo_client().close()
        get_mongo_client.cache_clear()
        logger.debug("MongoDB client closed")


class MongoRepository(Generic[T]):
    """Typed access to one collection, converting documents to/from a Pydantic model.

    Args:
        model: Pydantic model documents are validated into.
        collection_name: Name of the collection.
        database_name: Database name. Defaults to ``MONGO_DB_NAME``.
        client: Client to use. Defaults to the shared client; pass one to
            point at another cluster or to inject a fake in tests.
    """

    def __init__(
        self,
        model: type[T],
        collection_name: str,
        database_name: str | None = None,
        client: MongoClient[MongoDocument] | None = None,
    ) -> None:
        self.model = model
        client = client or get_mongo_client()
        self.collection: Collection[MongoDocument] = client[
            database_name or settings.mongo.DB_NAME
        ][collection_name]

    def clear_collection(self) -> int:
        """Delete every document in the collection.

        Returns:
            The number of deleted documents.
        """
        deleted = self.collection.delete_many({}).deleted_count
        logger.debug("Cleared {}: deleted {} documents", self.collection.name, deleted)
        return deleted

    def ingest_documents(self, documents: Iterable[T]) -> int:
        """Insert documents, letting MongoDB assign ``_id``.

        Returns:
            The number of inserted documents.

        Raises:
            ValueError: If ``documents`` is empty.
        """
        payload = [doc.model_dump(exclude={"_id"}) for doc in documents]
        if not payload:
            raise ValueError("No documents to ingest.")

        self.collection.insert_many(payload)
        logger.debug("Inserted {} documents into {}", len(payload), self.collection.name)
        return len(payload)

    def fetch_documents(self, query: Mapping[str, Any], limit: int | None = None) -> list[T]:
        """Return the documents matching ``query``.

        Args:
            query: MongoDB filter.
            limit: Maximum number of documents; ``None`` returns them all.
        """
        cursor = self.collection.find(query)
        if limit is not None:
            cursor = cursor.limit(limit)
        return [self._to_model(doc) for doc in cursor]

    def fetch_one(self, query: Mapping[str, Any]) -> T | None:
        """Return the first document matching ``query``, or ``None``."""
        document = self.collection.find_one(query)
        return None if document is None else self._to_model(document)

    def count(self) -> int:
        """Return the number of documents in the collection."""
        return self.collection.count_documents({})

    def _to_model(self, document: MongoDocument) -> T:
        """Validate a raw document into the model, stringifying ObjectIds."""
        return self.model.model_validate(
            {k: str(v) if isinstance(v, ObjectId) else v for k, v in document.items()}
        )
