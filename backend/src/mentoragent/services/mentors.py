from __future__ import annotations

from typing import TYPE_CHECKING

from mentoragent.core.exceptions import MentorNotFoundException

if TYPE_CHECKING:
    from mentoragent.db.client import AsyncMongoRepository
    from mentoragent.models.mentor_extract import MentorExtract


class MentorService:
    """Read access to the mentor catalogue.

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
            MentorNotFoundException: If no mentor has this id.
        """
        mentor = await self.repository.fetch_one({"id": mentor_id})
        if mentor is None:
            raise MentorNotFoundException(mentor_id)
        return mentor
