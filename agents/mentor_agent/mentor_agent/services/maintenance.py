"""Destructive maintenance operations, shared by the CLI and the admin API."""

from __future__ import annotations

from loguru import logger

from mentor_agent.config import settings
from mentor_agent.db.client import get_mongo_client


def drop_collections(*names: str) -> list[str]:
    """Drop the named collections that exist; return the ones dropped."""
    database = get_mongo_client()[settings.mongo.DB_NAME]
    existing = set(database.list_collection_names())
    dropped = [name for name in names if name in existing]
    for name in dropped:
        database.drop_collection(name)
        logger.info("Dropped collection {}", name)
    return dropped


def reset_conversation_state() -> list[str]:
    """Delete every conversation's short-term memory (checkpoints and writes)."""
    return drop_collections(
        settings.mongo.STATE_CHECKPOINT_COLLECTION, settings.mongo.STATE_WRITES_COLLECTION
    )


def delete_mentor_memory(mentor_id: str) -> int:
    """Delete one mentor's long-term memory chunks; return how many were deleted."""
    collection = get_mongo_client()[settings.mongo.DB_NAME][
        settings.mongo.LONG_TERM_MEMORY_COLLECTION
    ]
    deleted = collection.delete_many({"mentor_id": mentor_id}).deleted_count
    logger.info("Deleted {} memory chunks for {}", deleted, mentor_id)
    return deleted


def delete_long_term_memory() -> list[str]:
    """Delete the long-term memory collection, including its search indexes."""
    return drop_collections(settings.mongo.LONG_TERM_MEMORY_COLLECTION)
