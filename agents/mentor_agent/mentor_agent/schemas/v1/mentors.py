"""Mentor bodies."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from mentor_agent.models.mentor_extract import MentorExtract


class MentorOut(BaseModel):
    """Public view of a mentor (sources are not exposed)."""

    id: str
    name: str
    expertise: str
    perspective: str
    style: str
    image_url: str | None = None

    @classmethod
    def from_extract(cls, mentor: MentorExtract) -> MentorOut:
        return cls.model_validate(mentor.model_dump(include=set(cls.model_fields)))
