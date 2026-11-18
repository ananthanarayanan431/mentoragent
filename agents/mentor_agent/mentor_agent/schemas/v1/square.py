"""Request and response bodies for squares and what is shared inside one."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from mentor_agent.config import settings
from mentor_agent.schemas.common import MentorId

if TYPE_CHECKING:
    from mentor_agent.models.square import Square

GoalText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
SquareName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


def _limit_goal(v: str | None) -> str | None:
    if v is not None and len(v) > settings.agent.GOAL_MAX_CHARS:
        msg = f"must be at most {settings.agent.GOAL_MAX_CHARS} characters"
        raise ValueError(msg)
    return v


class GoalIn(BaseModel):
    """The square's goal: one line every mentor in it reads."""

    model_config = ConfigDict(extra="forbid")

    goal: GoalText

    @field_validator("goal")
    @classmethod
    def limit_length(cls, v: str) -> str:
        _limit_goal(v)
        return v


class SquareIn(BaseModel):
    """A new square: a name, and optionally its goal."""

    model_config = ConfigDict(extra="forbid")

    name: SquareName
    goal: GoalText | None = None

    @field_validator("goal")
    @classmethod
    def limit_length(cls, v: str | None) -> str | None:
        return _limit_goal(v)


class SquareUpdate(BaseModel):
    """Changes to a square; omitted fields stay as they are."""

    model_config = ConfigDict(extra="forbid")

    name: SquareName | None = None
    goal: GoalText | None = None

    @field_validator("goal")
    @classmethod
    def limit_length(cls, v: str | None) -> str | None:
        return _limit_goal(v)


class SquareOut(BaseModel):
    """A square: its name, goal and the mentors walking around it."""

    id: str
    name: str
    goal: str | None
    mentor_ids: list[str]
    created_at: datetime

    @classmethod
    def from_square(cls, square: Square) -> SquareOut:
        return cls.model_validate(square.model_dump(include=set(cls.model_fields)))


class GoalOut(BaseModel):
    """The square's goal, or ``null`` before one is set."""

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
