"""Mentor squares: make, rename and delete them, change their goal, and choose who
walks around each one."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Protocol

from mentor_agent.core.errors import LastSquareError, SquareNotFoundError
from mentor_agent.models.square import DEFAULT_SQUARE_ID, DEFAULT_SQUARE_NAME, Square

if TYPE_CHECKING:
    from collections.abc import Collection

    from mentor_agent.db.client import AsyncMongoRepository


class SquareReader(Protocol):
    """Where a square (its goal, its members) is read from."""

    async def get(self, square_id: str) -> Square: ...


class SquareContents(Protocol):
    """What a square holds besides itself: removed with the square."""

    async def delete_square(self, square_id: str) -> int: ...


class SquareService:
    """Reads and writes squares.

    Args:
        repository: Async repository over the squares collection.
    """

    def __init__(self, repository: AsyncMongoRepository[Square]) -> None:
        self.repository = repository

    async def list_squares(self) -> list[Square]:
        """Every square, oldest first."""
        return await self.repository.fetch_documents({}, sort=[("created_at", 1)])

    async def get(self, square_id: str) -> Square:
        """One square.

        Raises:
            SquareNotFoundError: If no square has this id.
        """
        square = await self.repository.fetch_one({"id": square_id})
        if square is None:
            raise SquareNotFoundError
        return square

    async def create(self, name: str, goal: str | None = None) -> Square:
        """Make an empty square."""
        now = datetime.now(UTC)
        square = Square(name=name, goal=goal, goal_updated_at=now if goal else None)
        return await self.repository.insert_one(square)

    async def update(self, square_id: str, changes: dict[str, Any]) -> Square:
        """Rename a square or change its goal.

        Raises:
            SquareNotFoundError: If no square has this id.
        """
        if "goal" in changes:
            changes = {**changes, "goal_updated_at": datetime.now(UTC)}
        if not changes:
            return await self.get(square_id)
        square = await self.repository.update_one({"id": square_id}, changes)
        if square is None:
            raise SquareNotFoundError
        return square

    async def set_goal(self, square_id: str, goal: str) -> Square:
        """Set or change the square's goal.

        Raises:
            SquareNotFoundError: If no square has this id.
        """
        return await self.update(square_id, {"goal": goal})

    async def delete(self, square_id: str, contents: Collection[SquareContents]) -> None:
        """Delete a square and what was said in it. The mentors stay.

        Raises:
            SquareNotFoundError: If no square has this id.
            LastSquareError: If it is the only square.
        """
        await self.get(square_id)
        if await self.repository.count({}) <= 1:
            raise LastSquareError
        await self.repository.delete_one({"id": square_id})
        for store in contents:
            await store.delete_square(square_id)

    async def add_mentor(self, square_id: str, mentor_id: str) -> Square:
        """Bring a mentor into the square (no change if they are there already).

        Raises:
            SquareNotFoundError: If no square has this id.
        """
        square = await self.repository.add_to_set({"id": square_id}, "mentor_ids", mentor_id)
        if square is None:
            raise SquareNotFoundError
        return square

    async def remove_mentor(self, square_id: str, mentor_id: str) -> Square:
        """Send a mentor out of the square. What they said there is kept.

        Raises:
            SquareNotFoundError: If no square has this id.
        """
        square = await self.repository.pull({"id": square_id}, "mentor_ids", mentor_id)
        if square is None:
            raise SquareNotFoundError
        return square

    async def forget_mentor(self, mentor_id: str) -> None:
        """Take a deleted mentor out of every square."""
        await self.repository.pull_everywhere("mentor_ids", mentor_id)

    async def mark_heard(self, square_id: str, mentor_id: str, at: datetime) -> None:
        """Record that this mentor has reacted to the others' advice in this square
        up to ``at``."""
        await self.repository.update_one({"id": square_id}, {f"heard_until.{mentor_id}": at})

    async def ensure_default(self, seed: Square) -> bool:
        """Create the first square from ``seed`` unless it exists; ``True`` if created."""
        if await self.repository.fetch_one({"id": DEFAULT_SQUARE_ID}) is not None:
            return False
        await self.repository.insert_one(seed.model_copy(update={"id": DEFAULT_SQUARE_ID}))
        return True


def first_square(
    goal: str | None,
    goal_updated_at: datetime | None,
    heard_until: dict[str, datetime],
    mentors: Collection[dict[str, Any]],
) -> Square:
    """The square that data from before squares existed moves into: the old global goal,
    and every mentor who was walking around the one square then. Pure.

    Args:
        goal: The old profile's goal.
        goal_updated_at: When it was set.
        heard_until: The old profile's per-mentor opener marks.
        mentors: Raw mentor documents; a missing ``in_square`` meant in the square.
    """
    return Square(
        id=DEFAULT_SQUARE_ID,
        name=DEFAULT_SQUARE_NAME,
        goal=goal,
        goal_updated_at=goal_updated_at,
        mentor_ids=sorted(
            str(doc["id"]) for doc in mentors if "id" in doc and doc.get("in_square", True)
        ),
        heard_until=heard_until,
    )
