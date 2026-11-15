"""One line of the advice ledger: what a mentor told the user."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, Field

from mentor_agent.models.times import UtcDatetime


class LedgerLine(BaseModel):
    """A piece of advice a mentor gave, short enough for every mentor to read.

    Attributes:
        id: Unique id (hex), used to delete the line.
        mentor_id: Who gave the advice.
        mentor_name: Their name, so readers need no lookup.
        conversation_id: The conversation it came from.
        topic: At most four words ("index funds").
        advice: One sentence, third person.
        created_at: When it was noted.
    """

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    mentor_id: str
    mentor_name: str
    conversation_id: str
    topic: str
    advice: str
    created_at: UtcDatetime = Field(default_factory=lambda: datetime.now(UTC))
