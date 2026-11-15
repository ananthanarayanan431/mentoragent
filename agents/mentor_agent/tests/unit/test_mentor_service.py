from __future__ import annotations

from typing import TYPE_CHECKING, cast
from unittest.mock import AsyncMock, MagicMock

import pytest

from mentor_agent.core.errors import (
    MemoryBuildInProgressError,
    MentorNotFoundError,
    MentorNotReadyError,
)
from mentor_agent.services.mentors import MentorService, ensure_ready_to_chat

if TYPE_CHECKING:
    from mentor_agent.db.client import AsyncMongoRepository
    from mentor_agent.models.mentor_extract import MentorExtract


def _service(*, deleted: bool, existing: MentorExtract | None) -> tuple[MentorService, MagicMock]:
    repository = MagicMock()
    repository.delete_one = AsyncMock(return_value=deleted)
    repository.fetch_one = AsyncMock(return_value=existing)
    service = MentorService(cast("AsyncMongoRepository[MentorExtract]", repository))
    return service, repository


async def test_remove_deletes_a_mentor_whose_memory_is_not_building(
    mentor_extract: MentorExtract,
) -> None:
    service, repository = _service(deleted=True, existing=mentor_extract)
    await service.remove_mentor("ada")
    repository.delete_one.assert_awaited_once_with({"id": "ada", "memory": {"$ne": "building"}})


async def test_remove_refuses_while_the_memory_is_building(mentor_extract: MentorExtract) -> None:
    building = mentor_extract.model_copy(update={"memory": "building"})
    service, _ = _service(deleted=False, existing=building)
    with pytest.raises(MemoryBuildInProgressError, match="once it finishes"):
        await service.remove_mentor("ada")


async def test_remove_an_unknown_mentor_is_not_found() -> None:
    service, _ = _service(deleted=False, existing=None)
    with pytest.raises(MentorNotFoundError):
        await service.remove_mentor("nobody")


@pytest.mark.parametrize("memory", [None, "ready", "failed"])
def test_chat_is_allowed_unless_the_memory_is_building(
    mentor_extract: MentorExtract, memory: str | None
) -> None:
    ensure_ready_to_chat(mentor_extract.model_copy(update={"memory": memory}))


def test_chat_is_refused_while_the_memory_is_building(mentor_extract: MentorExtract) -> None:
    with pytest.raises(MentorNotReadyError):
        ensure_ready_to_chat(mentor_extract.model_copy(update={"memory": "building"}))


async def test_interrupted_builds_are_marked_failed() -> None:
    service, repository = _service(deleted=False, existing=None)
    repository.update_many = AsyncMock(return_value=2)
    assert await service.fail_interrupted_builds() == 2
    repository.update_many.assert_awaited_once_with({"memory": "building"}, {"memory": "failed"})
