"""Request and response bodies."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from mentoragent.core.config import settings
from mentoragent.models.mentor_extract import MentorExtract

MentorId = Annotated[str, StringConstraints(min_length=1, max_length=128)]
# Restricted alphabet: the id becomes part of the checkpointer thread id.
ConversationId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]


class ChatRequest(BaseModel):
    """A user message to a mentor.

    Omit ``conversation_id`` to start a new conversation; send back the id
    from the response to continue it.
    """

    model_config = ConfigDict(extra="forbid")

    mentor_id: MentorId
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    conversation_id: ConversationId | None = None

    @field_validator("message")
    @classmethod
    def limit_length(cls, v: str) -> str:
        if len(v) > settings.agent.MAX_MESSAGE_CHARS:
            raise ValueError(f"must be at most {settings.agent.MAX_MESSAGE_CHARS} characters")
        return v


class ChatResponse(BaseModel):
    """The mentor's reply."""

    mentor_id: str
    conversation_id: str
    response: str


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


class ResetMemoryResponse(BaseModel):
    """Collections dropped by a memory reset."""

    dropped_collections: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
