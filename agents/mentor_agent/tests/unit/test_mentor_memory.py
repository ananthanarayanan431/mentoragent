from __future__ import annotations

from typing import TYPE_CHECKING, cast
from unittest.mock import MagicMock

import pytest
from langchain_core.documents import Document

from mentor_agent.rag.memory.long_term_memory_creator import LongTermMemoryCreator
from mentor_agent.services.memory import MentorMemoryBuilder
from tests.fakes import InMemoryMentorService

if TYPE_CHECKING:
    from collections.abc import Callable

    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.mentors import MentorService


def _builder(
    mentor_extract: MentorExtract, rebuild_one: Callable[[MentorExtract], int]
) -> tuple[MentorMemoryBuilder, InMemoryMentorService]:
    mentors = InMemoryMentorService([mentor_extract.model_copy(update={"memory": "building"})])
    builder = MentorMemoryBuilder(cast("MentorService", mentors), rebuild_one)
    return builder, mentors


def _chunks(count: int) -> Callable[[MentorExtract], int]:
    def rebuild_one(_mentor: MentorExtract) -> int:
        return count

    return rebuild_one


def _same(docs: list[Document]) -> list[Document]:
    return docs


async def test_a_successful_build_marks_the_memory_ready(mentor_extract: MentorExtract) -> None:
    builder, mentors = _builder(mentor_extract, _chunks(12))
    await builder.rebuild(mentor_extract.id)
    assert (await mentors.get_mentor(mentor_extract.id)).memory == "ready"


async def test_a_build_that_finds_nothing_is_failed(mentor_extract: MentorExtract) -> None:
    builder, mentors = _builder(mentor_extract, _chunks(0))
    await builder.rebuild(mentor_extract.id)
    assert (await mentors.get_mentor(mentor_extract.id)).memory == "failed"


async def test_a_crashing_build_is_failed_and_does_not_raise(mentor_extract: MentorExtract) -> None:
    def boom(_mentor: MentorExtract) -> int:
        msg = "embeddings API down"
        raise RuntimeError(msg)

    builder, mentors = _builder(mentor_extract, boom)
    await builder.rebuild(mentor_extract.id)  # a background task must not raise
    assert (await mentors.get_mentor(mentor_extract.id)).memory == "failed"


@pytest.fixture
def creator() -> tuple[LongTermMemoryCreator, MagicMock, MagicMock]:
    vectorstore = MagicMock()
    extractor = MagicMock()
    splitter = MagicMock()
    splitter.split_documents.side_effect = _same
    deduplicator = MagicMock()
    deduplicator.remove_duplicates.side_effect = _same
    return (
        LongTermMemoryCreator(vectorstore, splitter, extractor, deduplicator),
        vectorstore,
        extractor,
    )


def test_rebuild_one_replaces_only_that_mentors_chunks(
    creator: tuple[LongTermMemoryCreator, MagicMock, MagicMock],
    mentor_extract: MentorExtract,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    memory, vectorstore, extractor = creator
    monkeypatch.setattr(
        "mentor_agent.rag.memory.long_term_memory_creator.create_search_indexes", MagicMock()
    )
    extractor.extract.return_value = [Document(page_content="a"), Document(page_content="b")]

    assert memory.rebuild_one(mentor_extract) == 2
    vectorstore.collection.delete_many.assert_called_once_with({"mentor_id": mentor_extract.id})
    vectorstore.add_documents.assert_called_once()


def test_rebuild_one_keeps_the_old_memory_when_nothing_is_found(
    creator: tuple[LongTermMemoryCreator, MagicMock, MagicMock], mentor_extract: MentorExtract
) -> None:
    memory, vectorstore, extractor = creator
    extractor.extract.return_value = []

    assert memory.rebuild_one(mentor_extract) == 0
    vectorstore.collection.delete_many.assert_not_called()
    vectorstore.add_documents.assert_not_called()
