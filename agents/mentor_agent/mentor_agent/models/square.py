"""A mentor square: a group of mentors with its own goal. Everything said in a square
(conversations, the advice ledger, ambient chats) stays in that square; the mentors
themselves and their long-term memory are shared by every square."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from mentor_agent.models.times import UtcDatetime

#: The square that existing data was moved into, and the one a request without a
#: square id is about.
DEFAULT_SQUARE_ID = "main"
DEFAULT_SQUARE_NAME = "My square"


def new_square_id() -> str:
    """A random id for a new square."""
    return uuid.uuid4().hex[:12]


class Square(BaseModel):
    """One square.

    Attributes:
        id: Unique id; ``main`` for the first square.
        name: Shown in the square switcher.
        goal: What the user wants this square's mentors to help with; ``None`` until set.
        goal_updated_at: When the goal last changed.
        mentor_ids: The mentors walking around this square, in the order they joined.
        heard_until: Per mentor, the time up to which they have already reacted to
            the other mentors' advice in this square (so an opener never repeats).
        created_at: When the square was made.
    """

    id: str = Field(default_factory=new_square_id)
    name: str
    goal: str | None = None
    goal_updated_at: UtcDatetime | None = None
    mentor_ids: list[str] = Field(default_factory=list[str])
    heard_until: dict[str, UtcDatetime] = Field(default_factory=dict[str, datetime])
    created_at: UtcDatetime = Field(default_factory=lambda: datetime.now(UTC))
