"""Destructive maintenance operations, shared by the CLI and the admin API."""

from __future__ import annotations

from loguru import logger

from mentoragent.core.config import settings
from mentoragent.db.client import get_mongo_client


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


def delete_long_term_memory() -> list[str]:
    """Delete the long-term memory collection, including its search indexes."""
    return drop_collections(settings.mongo.LONG_TERM_MEMORY_COLLECTION)
