from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Coroutine
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Path,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from loguru import logger
from pydantic import ValidationError

from mentor_agent.core.dependencies import (
    AdviceLedgerDep,
    AmbientStoreDep,
    ConversationServiceDep,
    CurrentSquareDep,
    LedgerWriterDep,
    MentorServiceDep,
    SquareServiceDep,
    WebSocketSquareDep,
    require_websocket_api_key,
)
from mentor_agent.core.errors import MentorAgentError, unpack_validation_error
from mentor_agent.schemas.common import ConversationId
from mentor_agent.schemas.v1.chat import (
    ChatRequest,
    ChatResponse,
    GroupChatRequest,
    OpenerRequest,
    parse_client_message,
)
from mentor_agent.services.ambient import AmbientStore
from mentor_agent.services.conversation import ConversationService, in_square
from mentor_agent.services.group import group_context
from mentor_agent.services.ledger import (
    AdviceLedger,
    LedgerWriter,
    ledger_context,
    shared_context,
    should_open,
)
from mentor_agent.services.mentors import MentorService, ensure_ready_to_chat
from mentor_agent.services.squares import SquareService

#: Ledger lines an opener looks through: enough to find the newest from the others.
OPENER_LINES_SCANNED = 50

router = APIRouter(tags=["chat"])
websocket_router = APIRouter(tags=["chat"])

# Ledger notes run after the reply was sent; the set keeps each task alive until it ends.
_ledger_tasks: set[asyncio.Task[None]] = set()


def _note_later(coroutine: Coroutine[Any, Any, None]) -> None:
    task = asyncio.create_task(coroutine)
    _ledger_tasks.add(task)
    task.add_done_callback(_ledger_tasks.discard)


def _new_conversation_id() -> str:
    return uuid.uuid4().hex


@router.post("/chat")
async def chat(
    body: ChatRequest,
    mentors: MentorServiceDep,
    conversations: ConversationServiceDep,
    ledger_writer: LedgerWriterDep,
    square: CurrentSquareDep,
    squares: SquareServiceDep,
    ledger: AdviceLedgerDep,
    background: BackgroundTasks,
) -> ChatResponse:
    """Send a message to a mentor in the current square and get the full reply (409
    while their memory builds). The conversation and what the mentor reads stay in
    that square."""
    mentor = await mentors.get_mentor(body.mentor_id)
    ensure_ready_to_chat(mentor)
    conversation_id = body.conversation_id or _new_conversation_id()
    context = await shared_context(squares, ledger, square.id, mentor.id)
    reply = await conversations.respond(
        mentor.to_mentor(),
        body.message,
        in_square(square.id, conversation_id),
        mentor_context=context,
    )
    background.add_task(
        ledger_writer.record, square.id, mentor, conversation_id, body.message, reply.content
    )
    return ChatResponse(
        mentor_id=mentor.id, conversation_id=conversation_id, response=reply.content
    )


@router.delete("/conversations/{mentor_id}/{conversation_id}", status_code=204)
async def delete_conversation(
    mentor_id: str,
    conversation_id: Annotated[ConversationId, Path()],
    conversations: ConversationServiceDep,
    square: CurrentSquareDep,
) -> None:
    """Forget a conversation's history in the current square."""
    await conversations.delete_conversation(mentor_id, in_square(square.id, conversation_id))


@websocket_router.websocket("/ws/chat", dependencies=[Depends(require_websocket_api_key)])
async def chat_websocket(
    websocket: WebSocket,
    mentors: MentorServiceDep,
    conversations: ConversationServiceDep,
    ledger_writer: LedgerWriterDep,
    current: WebSocketSquareDep,
    squares: SquareServiceDep,
    ledger: AdviceLedgerDep,
    ambient_store: AmbientStoreDep,
) -> None:
    """Stream mentor replies over a WebSocket, in the square named by the ``square_id``
    query parameter (the first square when left out; an unknown one closes the socket).

    Client -> server, one JSON object per message::

        {"mentor_id": "...", "message": "...", "conversation_id": "..."?}   a turn
        {"mentor_id": "...", "opener": true, "conversation_id": "..."?}     speak first
        {"mentor_ids": [first, second], "message": "...", "conversation_id": "..."?,
         "ambient_id": "..."?}                                              a group turn

    Server -> client events::

        {"type": "start", "conversation_id": "..."}
        {"type": "chunk", "content": "..."}         (repeated)
        {"type": "end", "conversation_id": "...", "response": "..."}
        {"type": "error", "detail": ...}
        {"type": "silent", "conversation_id": ...}  an opener with nothing to say
        {"type": "turn_end", "conversation_id": "..."}  after both group replies

    In a group turn the first mentor streams ``start``, ``chunk``s and ``end``, then
    the second does, every event carrying ``mentor_id``; the second has read the
    first's answer. ``ambient_id`` (first turn only) is the chat the user joined.

    An error ends the current turn, not the connection. A mentor whose memory is
    still building gets an ``error`` event and no ``start`` (an opener: ``silent``).
    A mentor opens only with advice from another mentor that is newer than what
    they already said or reacted to; the opener is saved in the conversation.
    """
    square = _Square(
        current.id, mentors, conversations, ledger_writer, squares, ledger, ambient_store
    )
    await websocket.accept()
    try:
        while True:
            try:
                body = parse_client_message(await websocket.receive_json())
            except ValidationError as exc:
                await websocket.send_json(
                    {"type": "error", "detail": unpack_validation_error(exc)["errors"]}
                )
                continue
            except ValueError:
                await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
                continue

            try:
                if isinstance(body, OpenerRequest):
                    await _open(websocket, square, body)
                elif isinstance(body, GroupChatRequest):
                    await _group(websocket, square, body)
                else:
                    await _reply(websocket, square, body)
            except MentorAgentError as exc:
                await websocket.send_json({"type": "error", "detail": exc.message})
            except WebSocketDisconnect:
                raise
            except Exception:  # noqa: BLE001 - keep the socket open; the traceback is logged
                logger.exception("Unexpected error in WebSocket chat")
                await websocket.send_json({"type": "error", "detail": "Internal Server Error"})
    except WebSocketDisconnect:
        logger.debug("WebSocket client disconnected")
    except RuntimeError:
        # Sending after the client went away mid-stream.
        logger.debug("WebSocket closed during send")
    else:  # pragma: no cover - loop only exits via exceptions
        await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)


@dataclass(frozen=True, slots=True)
class _Square:
    """The square a socket is in, and the services one turn needs."""

    id: str
    mentors: MentorService
    conversations: ConversationService
    ledger_writer: LedgerWriter
    squares: SquareService
    ledger: AdviceLedger
    ambient_store: AmbientStore


async def _stream(
    websocket: WebSocket,
    conversation_id: str,
    tokens: AsyncIterator[str],
    mentor_id: str | None = None,
) -> str:
    """Send ``start``, a ``chunk`` per token and ``end``; return the whole reply.
    In a group turn every event also names the speaker."""
    tag = {"mentor_id": mentor_id} if mentor_id else {}
    await websocket.send_json({"type": "start", "conversation_id": conversation_id, **tag})
    parts: list[str] = []
    async for token in tokens:
        parts.append(token)
        await websocket.send_json({"type": "chunk", "content": token, **tag})
    reply = "".join(parts)
    await websocket.send_json(
        {"type": "end", "conversation_id": conversation_id, "response": reply, **tag}
    )
    return reply


async def _reply(websocket: WebSocket, square: _Square, body: ChatRequest) -> None:
    conversation_id = body.conversation_id or _new_conversation_id()
    mentor = await square.mentors.get_mentor(body.mentor_id)
    ensure_ready_to_chat(mentor)
    context = await shared_context(square.squares, square.ledger, square.id, mentor.id)
    tokens = square.conversations.stream(
        mentor.to_mentor(),
        body.message,
        in_square(square.id, conversation_id),
        mentor_context=context,
    )
    reply = await _stream(websocket, conversation_id, tokens)
    _note_later(
        square.ledger_writer.record(square.id, mentor, conversation_id, body.message, reply)
    )


async def _open(websocket: WebSocket, square: _Square, body: OpenerRequest) -> None:
    mentor = await square.mentors.get_mentor(body.mentor_id)
    current = await square.squares.get(square.id)
    lines = await square.ledger.recent(square.id, OPENER_LINES_SCANNED)
    heard_until = current.heard_until.get(mentor.id)
    if mentor.memory == "building" or not should_open(mentor.id, lines, heard_until):
        await websocket.send_json({"type": "silent", "conversation_id": body.conversation_id})
        return
    conversation_id = body.conversation_id or _new_conversation_id()
    context = ledger_context(current.goal, lines, mentor.id)
    tokens = square.conversations.open(
        mentor.to_mentor(), in_square(square.id, conversation_id), context
    )
    await _stream(websocket, conversation_id, tokens)
    await square.squares.mark_heard(square.id, mentor.id, datetime.now(UTC))


async def _group(websocket: WebSocket, square: _Square, body: GroupChatRequest) -> None:
    conversation_id = body.conversation_id or _new_conversation_id()
    first = await square.mentors.get_mentor(body.mentor_ids[0])
    second = await square.mentors.get_mentor(body.mentor_ids[1])
    ensure_ready_to_chat(first)
    ensure_ready_to_chat(second)
    names = {first.id: first.name, second.id: second.name}
    ambient: list[tuple[str, str]] | None = None
    if body.ambient_id:
        chat = await square.ambient_store.get(square.id, body.ambient_id)
        if chat:
            ambient = [
                (names.get(line.mentor_id, line.mentor_id), line.text) for line in chat.lines
            ]

    answer: str | None = None
    thread = in_square(square.id, conversation_id)
    for speaker, other in ((first, second), (second, first)):
        shared = await shared_context(square.squares, square.ledger, square.id, speaker.id)
        last = None if answer else await square.conversations.last_reply(other.id, thread)
        group = group_context(other.name, ambient=ambient, just_said=answer, last_said=last)
        tokens = square.conversations.stream(
            speaker.to_mentor(),
            body.message,
            thread,
            mentor_context="\n\n".join(part for part in (shared, group) if part),
        )
        answer = await _stream(websocket, conversation_id, tokens, mentor_id=speaker.id)
        _note_later(
            square.ledger_writer.record(square.id, speaker, conversation_id, body.message, answer)
        )
    await websocket.send_json({"type": "turn_end", "conversation_id": conversation_id})
