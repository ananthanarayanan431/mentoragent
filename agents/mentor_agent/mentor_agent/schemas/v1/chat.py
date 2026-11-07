"""Chat request and response bodies."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from mentor_agent.config import settings
from mentor_agent.schemas.common import ConversationId, MentorId


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
            msg = f"must be at most {settings.agent.MAX_MESSAGE_CHARS} characters"
            raise ValueError(msg)
        return v


class ChatResponse(BaseModel):
    """The mentor's reply."""

    mentor_id: str
    conversation_id: str
    response: str
