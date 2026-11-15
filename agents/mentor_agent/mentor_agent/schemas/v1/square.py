"""Request and response bodies for the square's shared state."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from mentor_agent.config import settings
from mentor_agent.schemas.common import MentorId


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


class AmbientIn(BaseModel):
    """Two different mentors; the first (the visitor) speaks first."""

    model_config = ConfigDict(extra="forbid")

    mentor_ids: list[MentorId]

    @field_validator("mentor_ids")
    @classmethod
    def two_different(cls, v: list[str]) -> list[str]:
        if len(v) != 2 or v[0] == v[1]:
            msg = "must be two different mentor ids"
            raise ValueError(msg)
        return v


class AmbientLineOut(BaseModel):
    """One thing one mentor said."""

    mentor_id: str
    text: str


class AmbientChatOut(BaseModel):
    """Two mentors chatting about the user's goal."""

    id: str
    mentor_ids: list[str]
    lines: list[AmbientLineOut]
    about_user: bool
    created_at: datetime
