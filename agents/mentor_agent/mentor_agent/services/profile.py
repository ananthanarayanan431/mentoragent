"""The user's profile: one document holding their goal."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from mentor_agent.models.profile import PROFILE_KEY, Profile

if TYPE_CHECKING:
    from mentor_agent.db.client import AsyncMongoRepository


class ProfileService:
    """Reads and writes the single profile document.

    Args:
        repository: Async repository over the profile collection.
    """

    def __init__(self, repository: AsyncMongoRepository[Profile]) -> None:
        self.repository = repository

    async def get(self) -> Profile:
        """The profile; an empty one before anything was saved."""
        return await self.repository.fetch_one({"key": PROFILE_KEY}) or Profile()

    async def set_goal(self, goal: str) -> Profile:
        """Save the goal (creating the profile on first use) and return the profile."""
        changes = {"key": PROFILE_KEY, "goal": goal, "updated_at": datetime.now(UTC)}
        profile = await self.repository.update_one({"key": PROFILE_KEY}, changes, upsert=True)
        return profile or Profile(goal=goal)
