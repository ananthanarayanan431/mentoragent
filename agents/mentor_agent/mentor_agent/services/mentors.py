from __future__ import annotations

from typing import TYPE_CHECKING, Any

from mentor_agent.core.errors import MemoryBuildInProgressError, MentorNotFoundError
from mentor_agent.models.mentor_extract import MentorExtract
from mentor_agent.services.custom import new_mentor_id
from mentor_agent.services.pool import pick_new_mentor

if TYPE_CHECKING:
    import random
    from collections.abc import Mapping, Sequence

    from mentor_agent.db.client import AsyncMongoRepository
    from mentor_agent.models.mentor_extract import MemoryStatus


class MentorService:
    """The mentor catalogue: read it, add mentors from the pool or
    described by the user, edit them.

    Args:
        repository: Async repository over the mentors collection.
    """

    def __init__(self, repository: AsyncMongoRepository[MentorExtract]) -> None:
        self.repository = repository

    async def list_mentors(self) -> list[MentorExtract]:
        """Return every mentor, sorted by name."""
        return await self.repository.fetch_documents({}, sort=[("name", 1)])

    async def get_mentor(self, mentor_id: str) -> MentorExtract:
        """Return one mentor.

        Raises:
            MentorNotFoundError: If no mentor has this id.
        """
        mentor = await self.repository.fetch_one({"id": mentor_id})
        if mentor is None:
            raise MentorNotFoundError(mentor_id)
        return mentor

    async def ids(self) -> set[str]:
        """Ids of every mentor in the square."""
        return await self.repository.ids()

    async def add_from_pool(
        self, pool: Sequence[MentorExtract], rng: random.Random
    ) -> MentorExtract:
        """Add a random pool mentor who is not in the square yet.

        Raises:
            PoolExhaustedError: If every pool mentor is already here.
        """
        mentor = pick_new_mentor(pool, await self.repository.ids(), rng)
        return await self.repository.insert_one(mentor)

    async def add_custom(self, fields: Mapping[str, Any]) -> MentorExtract:
        """Add a mentor described by the user, with an id made from their name and
        memory marked building.

        Args:
            fields: Every ``MentorExtract`` field except ``id`` and ``memory``.
        """
        mentor_id = new_mentor_id(str(fields["name"]), await self.repository.ids())
        mentor = MentorExtract.model_validate({**fields, "id": mentor_id, "memory": "building"})
        return await self.repository.insert_one(mentor)

    async def update_mentor(self, mentor_id: str, changes: Mapping[str, Any]) -> MentorExtract:
        """Change a mentor's persona or sources.

        Raises:
            MentorNotFoundError: If no mentor has this id.
        """
        if not changes:
            return await self.get_mentor(mentor_id)
        mentor = await self.repository.update_one({"id": mentor_id}, changes)
        if mentor is None:
            raise MentorNotFoundError(mentor_id)
        return mentor

    async def start_memory_build(self, mentor_id: str) -> MentorExtract:
        """Mark a mentor's memory as building, unless a build is already running.

        Atomic: of two concurrent requests, only one starts a build.

        Raises:
            MemoryBuildInProgressError: If a build is already running.
            MentorNotFoundError: If no mentor has this id.
        """
        mentor = await self.repository.update_one(
            {"id": mentor_id, "memory": {"$ne": "building"}}, {"memory": "building"}
        )
        if mentor is None:
            await self.get_mentor(mentor_id)  # raises MentorNotFoundError if missing
            raise MemoryBuildInProgressError
        return mentor

    async def remove_mentor(self, mentor_id: str) -> None:
        """Take a mentor out of the square; pool mentors can be added back later.

        Atomic: a mentor whose memory is building is not removed, so a build never
        writes chunks or a status for a mentor who is gone.

        Raises:
            MemoryBuildInProgressError: If their memory is being built.
            MentorNotFoundError: If no mentor has this id.
        """
        if await self.repository.delete_one({"id": mentor_id, "memory": {"$ne": "building"}}):
            return
        await self.get_mentor(mentor_id)  # raises MentorNotFoundError if missing
        msg = "This mentor's memory is being built; remove them once it finishes."
        raise MemoryBuildInProgressError(msg)

    async def set_memory_status(self, mentor_id: str, status: MemoryStatus) -> None:
        """Record how a memory build ended."""
        await self.repository.update_one({"id": mentor_id}, {"memory": status})
