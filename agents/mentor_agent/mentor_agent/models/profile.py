"""The one user's profile in the square: their goal, and what each mentor has heard."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from mentor_agent.models.times import UtcDatetime

#: There is one user, so there is one profile document, found by this key.
PROFILE_KEY: Literal["me"] = "me"


class Profile(BaseModel):
    """What every mentor in the square may know about the user.

    Attributes:
        key: Always ``"me"``: the app has one user.
        goal: What the user wants the mentors to help with; ``None`` until set.
        updated_at: When the goal last changed.
        heard_until: Per mentor, the time up to which they have already reacted
            to the other mentors' advice (so an opener never repeats).
    """

    key: Literal["me"] = PROFILE_KEY
    goal: str | None = None
    updated_at: UtcDatetime | None = None
    heard_until: dict[str, UtcDatetime] = Field(default_factory=dict[str, datetime])
