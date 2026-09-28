from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from bson import ObjectId
from pydantic import BaseModel

from mentoragent.db.client import MongoRepository


class Item(BaseModel):
    id: str
    name: str


@pytest.fixture
def repo() -> MongoRepository[Item]:
    return MongoRepository(Item, "items", database_name="db", client=MagicMock())


def test_fetch_converts_object_ids(repo: MongoRepository[Item]) -> None:
    repo.collection.find.return_value = [{"_id": ObjectId(), "id": "1", "name": "a"}]
    assert repo.fetch_documents({}) == [Item(id="1", name="a")]


def test_fetch_one_returns_none_when_missing(repo: MongoRepository[Item]) -> None:
    repo.collection.find_one.return_value = None
    assert repo.fetch_one({"id": "x"}) is None


def test_ingest_rejects_empty_input(repo: MongoRepository[Item]) -> None:
    with pytest.raises(ValueError, match="No documents"):
        repo.ingest_documents([])


def test_ingest_inserts_dumped_models(repo: MongoRepository[Item]) -> None:
    assert repo.ingest_documents([Item(id="1", name="a")]) == 1
    repo.collection.insert_many.assert_called_once_with([{"id": "1", "name": "a"}])
