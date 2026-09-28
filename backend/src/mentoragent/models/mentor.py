from __future__ import annotations

from pydantic import BaseModel, Field


class Mentor(BaseModel):
    """A mentor persona, as consumed by the conversation workflow."""

    id: str = Field(description="Unique identifier for the mentor")
    mentor_name: str = Field(description="Name of the mentor")
    mentor_expertise: str = Field(description="Expertise of the mentor")
    mentor_perspective: str = Field(description="Perspective of the mentor")
    mentor_style: str = Field(description="Style of the mentor")
