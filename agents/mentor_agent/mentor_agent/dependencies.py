"""FastAPI dependencies: services from app state, and API-key auth."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Security, WebSocketException, status
from fastapi.security import APIKeyHeader
from starlette.requests import HTTPConnection

from mentor_agent.config import settings
from mentor_agent.errors import PermissionDeniedError
from mentor_agent.models.mentor_extract import MentorExtract
from mentor_agent.services.conversation import ConversationService
from mentor_agent.services.memory import MemoryBuilder
from mentor_agent.services.mentors import MentorService
from mentor_agent.services.persona import PersonaWriter

API_KEY_HEADER = "X-API-Key"
_api_key_header = APIKeyHeader(name=API_KEY_HEADER, auto_error=False)


def _key_is_valid(provided: str | None) -> bool:
    expected = settings.app.API_KEY
    if expected is None:
        return True
    return provided is not None and secrets.compare_digest(
        provided.encode(), expected.get_secret_value().encode()
    )


async def require_api_key(api_key: Annotated[str | None, Security(_api_key_header)]) -> None:
    """Reject the request unless it carries the configured ``X-API-Key``.

    A no-op when ``API_KEY`` is not configured.
    """
    if not _key_is_valid(api_key):
        msg = "Invalid or missing API key"
        raise PermissionDeniedError(msg)


async def require_websocket_api_key(connection: HTTPConnection) -> None:
    """WebSocket variant: browsers cannot set headers, so the key may come as
    the ``api_key`` query parameter."""
    provided = connection.headers.get(API_KEY_HEADER) or connection.query_params.get("api_key")
    if not _key_is_valid(provided):
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid API key")


def get_conversation_service(connection: HTTPConnection) -> ConversationService:
    service: ConversationService = connection.app.state.conversations
    return service


def get_mentor_service(connection: HTTPConnection) -> MentorService:
    service: MentorService = connection.app.state.mentors
    return service


ConversationServiceDep = Annotated[ConversationService, Depends(get_conversation_service)]
MentorServiceDep = Annotated[MentorService, Depends(get_mentor_service)]


def get_memory_builder(connection: HTTPConnection) -> MemoryBuilder:
    builder: MemoryBuilder = connection.app.state.memory
    return builder


def get_mentor_pool(connection: HTTPConnection) -> list[MentorExtract]:
    pool: list[MentorExtract] = connection.app.state.pool
    return pool


def get_persona_writer(connection: HTTPConnection) -> PersonaWriter:
    writer: PersonaWriter = connection.app.state.personas
    return writer


MemoryBuilderDep = Annotated[MemoryBuilder, Depends(get_memory_builder)]
MentorPoolDep = Annotated[list[MentorExtract], Depends(get_mentor_pool)]
PersonaWriterDep = Annotated[PersonaWriter, Depends(get_persona_writer)]


async def require_api_key_in_production() -> None:
    """Changes that cost money or delete data (adding mentors, building memory,
    resetting conversations) need an API key in production; locally they are open.
    """
    if settings.app.is_production and settings.app.API_KEY is None:
        msg = "This action requires API_KEY to be configured in production"
        raise PermissionDeniedError(msg)
