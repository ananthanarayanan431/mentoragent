"""A short chat between two mentors about the user's goal, overheard in the square."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from mentor_agent.models.times import UtcDatetime


class AmbientLine(BaseModel):
    """One thing one mentor said."""

    mentor_id: str
    text: str


class AmbientChat(BaseModel):
    """Two mentors talking: who, what they said in order, and when.

    Attributes:
        id: Unique id (hex); joining the chat continues from it.
        mentor_ids: The visitor first, then the host.
        lines: What they said, in order.
        created_at: When it was written.
    """

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    mentor_ids: list[str]
    lines: list[AmbientLine]
    created_at: UtcDatetime = Field(default_factory=lambda: datetime.now(UTC))
