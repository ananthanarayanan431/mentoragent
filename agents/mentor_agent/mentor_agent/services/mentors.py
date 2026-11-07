from __future__ import annotations

from typing import TYPE_CHECKING, Any

from mentor_agent.errors import MemoryBuildInProgressError, MentorNotFoundError
from mentor_agent.services.pool import pick_new_mentor

if TYPE_CHECKING:
    import random
    from collections.abc import Mapping, Sequence

    from mentor_agent.db.client import AsyncMongoRepository
    from mentor_agent.models.mentor_extract import MemoryStatus, MentorExtract


class MentorService:
    """The mentor catalogue: read it, add mentors from the pool, edit them.

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

    async def set_memory_status(self, mentor_id: str, status: MemoryStatus) -> None:
        """Record how a memory build ended."""
        await self.repository.update_one({"id": mentor_id}, {"memory": status})
