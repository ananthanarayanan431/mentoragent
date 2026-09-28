"""FastAPI dependencies: services from app state, and API-key auth."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Security, WebSocketException, status
from fastapi.security import APIKeyHeader
from starlette.requests import HTTPConnection

from mentoragent.core.config import settings
from mentoragent.core.exceptions import PermissionException
from mentoragent.services.conversation import ConversationService
from mentoragent.services.mentors import MentorService

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
        raise PermissionException("Invalid or missing API key")


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
