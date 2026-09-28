"""MongoDB access.

A MongoDB client is a thread-safe connection pool meant to be created once per
process. Two are provided:

* :func:`get_mongo_client` - synchronous; used by LangChain / LangGraph
  components (vector store, checkpointer) and by batch jobs.
* :func:`get_async_mongo_client` - native asyncio; used by the API so reads
  never block the event loop.

Repositories borrow these shared clients rather than opening their own.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING, Any, Generic, TypeVar

from bson import ObjectId
from loguru import logger
from pydantic import BaseModel
from pymongo import AsyncMongoClient, MongoClient
from pymongo.server_api import ServerApi

from mentoragent.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

    from pymongo.asynchronous.collection import AsyncCollection
    from pymongo.collection import Collection

T = TypeVar("T", bound=BaseModel)

MongoDocument = dict[str, Any]

# Fail fast instead of hanging for pymongo's 30 s default when the DB is down.
_CLIENT_OPTIONS: dict[str, Any] = {
    "server_api": ServerApi("1"),
    "serverSelectionTimeoutMS": 5_000,
    "appname": "mentoragent",
}


@lru_cache(maxsize=1)
def get_mongo_client() -> MongoClient[MongoDocument]:
    """Return the process-wide synchronous client, connecting on first use.

    Raises:
        pymongo.errors.PyMongoError: If the server cannot be reached.
    """
    client: MongoClient[MongoDocument] = MongoClient(settings.mongo.URI, **_CLIENT_OPTIONS)
    try:
        client.admin.command("ping")
    except Exception:
        client.close()
        logger.exception("Failed to connect to MongoDB")
        raise
    logger.info("Connected to MongoDB (sync client)")
    return client


@lru_cache(maxsize=1)
def get_async_mongo_client() -> AsyncMongoClient[MongoDocument]:
    """Return the process-wide asyncio client. Connects lazily on first use."""
    return AsyncMongoClient(settings.mongo.URI, **_CLIENT_OPTIONS)


async def close_mongo_clients() -> None:
    """Close both shared clients. Call once on application shutdown."""
    if get_mongo_client.cache_info().currsize:
        get_mongo_client().close()
        get_mongo_client.cache_clear()
    if get_async_mongo_client.cache_info().currsize:
        await get_async_mongo_client().close()
        get_async_mongo_client.cache_clear()
    logger.debug("MongoDB clients closed")


def _to_model(model: type[T], document: MongoDocument) -> T:
    """Validate a raw document into ``model``, stringifying ObjectIds."""
    return model.model_validate(
        {k: str(v) if isinstance(v, ObjectId) else v for k, v in document.items()}
    )


class MongoRepository(Generic[T]):
    """Typed synchronous access to one collection.

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

    def upsert_documents(self, documents: Iterable[T], key: str = "id") -> int:
        """Insert or replace documents matched on ``key``. Safe to re-run.

        Returns:
            The number of documents written.
        """
        count = 0
        for doc in documents:
            payload = doc.model_dump(exclude={"_id"})
            self.collection.replace_one({key: payload[key]}, payload, upsert=True)
            count += 1
        logger.debug("Upserted {} documents into {}", count, self.collection.name)
        return count

    def fetch_documents(self, query: Mapping[str, Any], limit: int | None = None) -> list[T]:
        """Return the documents matching ``query``.

        Args:
            query: MongoDB filter.
            limit: Maximum number of documents; ``None`` returns them all.
        """
        cursor = self.collection.find(query)
        if limit is not None:
            cursor = cursor.limit(limit)
        return [_to_model(self.model, doc) for doc in cursor]

    def fetch_one(self, query: Mapping[str, Any]) -> T | None:
        """Return the first document matching ``query``, or ``None``."""
        document = self.collection.find_one(query)
        return None if document is None else _to_model(self.model, document)

    def count(self) -> int:
        """Return the number of documents in the collection."""
        return self.collection.count_documents({})


class AsyncMongoRepository(Generic[T]):
    """Typed asyncio access to one collection; the API's read path.

    Args:
        model: Pydantic model documents are validated into.
        collection_name: Name of the collection.
        database_name: Database name. Defaults to ``MONGO_DB_NAME``.
        client: Client to use. Defaults to the shared asyncio client.
    """

    def __init__(
        self,
        model: type[T],
        collection_name: str,
        database_name: str | None = None,
        client: AsyncMongoClient[MongoDocument] | None = None,
    ) -> None:
        self.model = model
        client = client or get_async_mongo_client()
        self.collection: AsyncCollection[MongoDocument] = client[
            database_name or settings.mongo.DB_NAME
        ][collection_name]

    async def fetch_documents(
        self,
        query: Mapping[str, Any],
        limit: int | None = None,
        sort: list[tuple[str, int]] | None = None,
    ) -> list[T]:
        """Return the documents matching ``query``."""
        cursor = self.collection.find(query)
        if sort:
            cursor = cursor.sort(sort)
        if limit is not None:
            cursor = cursor.limit(limit)
        return [_to_model(self.model, doc) async for doc in cursor]

    async def fetch_one(self, query: Mapping[str, Any]) -> T | None:
        """Return the first document matching ``query``, or ``None``."""
        document = await self.collection.find_one(query)
        return None if document is None else _to_model(self.model, document)
