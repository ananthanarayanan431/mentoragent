"""FastAPI dependencies: services from app state, and API-key auth."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Header, Query, Security, WebSocketException, status
from fastapi.security import APIKeyHeader
from starlette.requests import HTTPConnection

from mentor_agent.config import settings
from mentor_agent.core.errors import PermissionDeniedError, SquareNotFoundError
from mentor_agent.models.mentor_extract import MentorExtract
from mentor_agent.models.square import DEFAULT_SQUARE_ID, Square
from mentor_agent.schemas.common import SquareId
from mentor_agent.services.ambient import AmbientChats, AmbientStore
from mentor_agent.services.conversation import ConversationService
from mentor_agent.services.enrich import Enricher
from mentor_agent.services.ledger import AdviceLedger, LedgerWriter
from mentor_agent.services.memory import MemoryBuilder
from mentor_agent.services.mentors import MentorService
from mentor_agent.services.presets import PresetMentor
from mentor_agent.services.squares import SquareService

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


def get_mentor_presets(connection: HTTPConnection) -> list[PresetMentor]:
    presets: list[PresetMentor] = connection.app.state.presets
    return presets


def get_enricher(connection: HTTPConnection) -> Enricher:
    enricher: Enricher = connection.app.state.enricher
    return enricher


def get_square_service(connection: HTTPConnection) -> SquareService:
    service: SquareService = connection.app.state.squares
    return service


def get_ledger(connection: HTTPConnection) -> AdviceLedger:
    ledger: AdviceLedger = connection.app.state.ledger
    return ledger


def get_ledger_writer(connection: HTTPConnection) -> LedgerWriter:
    writer: LedgerWriter = connection.app.state.ledger_writer
    return writer


def get_ambient_chats(connection: HTTPConnection) -> AmbientChats:
    ambient: AmbientChats = connection.app.state.ambient
    return ambient


def get_ambient_store(connection: HTTPConnection) -> AmbientStore:
    store: AmbientStore = connection.app.state.ambient_store
    return store


MemoryBuilderDep = Annotated[MemoryBuilder, Depends(get_memory_builder)]
AmbientStoreDep = Annotated[AmbientStore, Depends(get_ambient_store)]
AmbientChatsDep = Annotated[AmbientChats, Depends(get_ambient_chats)]
AdviceLedgerDep = Annotated[AdviceLedger, Depends(get_ledger)]
LedgerWriterDep = Annotated[LedgerWriter, Depends(get_ledger_writer)]
SquareServiceDep = Annotated[SquareService, Depends(get_square_service)]
MentorPoolDep = Annotated[list[MentorExtract], Depends(get_mentor_pool)]
MentorPresetsDep = Annotated[list[PresetMentor], Depends(get_mentor_presets)]
EnricherDep = Annotated[Enricher, Depends(get_enricher)]


async def require_api_key_in_production() -> None:
    """Changes that cost money or delete data (adding mentors, building memory,
    resetting conversations) need an API key in production; locally they are open.
    """
    if settings.app.is_production and settings.app.API_KEY is None:
        msg = "This action requires API_KEY to be configured in production"
        raise PermissionDeniedError(msg)


async def get_current_square(
    squares: SquareServiceDep,
    x_square_id: Annotated[
        SquareId | None,
        Header(description="The square this request is about; the first square if left out."),
    ] = None,
) -> Square:
    """The square an HTTP request is about, from the ``X-Square-Id`` header.

    Raises:
        SquareNotFoundError: If no square has this id.
    """
    return await squares.get(x_square_id or DEFAULT_SQUARE_ID)


async def get_websocket_square(
    squares: SquareServiceDep,
    square_id: Annotated[
        SquareId | None,
        Query(description="The square this socket is about; the first square if left out."),
    ] = None,
) -> Square:
    """The square a chat socket is about, from the ``square_id`` query parameter
    (browsers cannot set headers on a WebSocket).

    Raises:
        WebSocketException: Closing the socket (policy violation) if no square has this id.
    """
    try:
        return await squares.get(square_id or DEFAULT_SQUARE_ID)
    except SquareNotFoundError:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION, reason="No such square"
        ) from None


CurrentSquareDep = Annotated[Square, Depends(get_current_square)]
WebSocketSquareDep = Annotated[Square, Depends(get_websocket_square)]
