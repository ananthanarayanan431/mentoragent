"""Request and response bodies for the square's shared state."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from mentor_agent.config import settings


class GoalIn(BaseModel):
    """The user's goal: one line every mentor reads."""

    model_config = ConfigDict(extra="forbid")

    goal: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

    @field_validator("goal")
    @classmethod
    def limit_length(cls, v: str) -> str:
        if len(v) > settings.agent.GOAL_MAX_CHARS:
            msg = f"must be at most {settings.agent.GOAL_MAX_CHARS} characters"
            raise ValueError(msg)
        return v


class GoalOut(BaseModel):
    """The user's goal, or ``null`` before one is set."""

    goal: str | None


class LedgerLineOut(BaseModel):
    """One piece of advice a mentor gave the user."""

    id: str
    mentor_id: str
    mentor_name: str
    topic: str
    advice: str
    created_at: datetime
