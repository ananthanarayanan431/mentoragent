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
    LedgerWriterDep,
    MentorServiceDep,
    ProfileServiceDep,
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
from mentor_agent.services.conversation import ConversationService
from mentor_agent.services.group import group_context
from mentor_agent.services.ledger import (
    AdviceLedger,
    LedgerWriter,
    ledger_context,
    shared_context,
    should_open,
)
from mentor_agent.services.mentors import MentorService, ensure_ready_to_chat
from mentor_agent.services.profile import ProfileService

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
    profile: ProfileServiceDep,
    ledger: AdviceLedgerDep,
    background: BackgroundTasks,
) -> ChatResponse:
    """Send a message to a mentor and get the full reply (409 while their memory builds)."""
    mentor = await mentors.get_mentor(body.mentor_id)
    ensure_ready_to_chat(mentor)
    conversation_id = body.conversation_id or _new_conversation_id()
    context = await shared_context(profile, ledger, mentor.id)
    reply = await conversations.respond(
        mentor.to_mentor(), body.message, conversation_id, mentor_context=context
    )
    background.add_task(ledger_writer.record, mentor, conversation_id, body.message, reply.content)
    return ChatResponse(
        mentor_id=mentor.id, conversation_id=conversation_id, response=reply.content
    )


@router.delete("/conversations/{mentor_id}/{conversation_id}", status_code=204)
async def delete_conversation(
    mentor_id: str,
    conversation_id: Annotated[ConversationId, Path()],
    conversations: ConversationServiceDep,
) -> None:
    """Forget a conversation's history."""
    await conversations.delete_conversation(mentor_id, conversation_id)


@websocket_router.websocket("/ws/chat", dependencies=[Depends(require_websocket_api_key)])
async def chat_websocket(
    websocket: WebSocket,
    mentors: MentorServiceDep,
    conversations: ConversationServiceDep,
    ledger_writer: LedgerWriterDep,
    profile: ProfileServiceDep,
    ledger: AdviceLedgerDep,
    ambient_store: AmbientStoreDep,
) -> None:
    """Stream mentor replies over a WebSocket.

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
    square = _Square(mentors, conversations, ledger_writer, profile, ledger, ambient_store)
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
    """The services one WebSocket turn needs."""

    mentors: MentorService
    conversations: ConversationService
    ledger_writer: LedgerWriter
    profile: ProfileService
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
    context = await shared_context(square.profile, square.ledger, mentor.id)
    tokens = square.conversations.stream(
        mentor.to_mentor(), body.message, conversation_id, mentor_context=context
    )
    reply = await _stream(websocket, conversation_id, tokens)
    _note_later(square.ledger_writer.record(mentor, conversation_id, body.message, reply))


async def _open(websocket: WebSocket, square: _Square, body: OpenerRequest) -> None:
    mentor = await square.mentors.get_mentor(body.mentor_id)
    profile = await square.profile.get()
    lines = await square.ledger.recent(OPENER_LINES_SCANNED)
    heard_until = profile.heard_until.get(mentor.id)
    if mentor.memory == "building" or not should_open(mentor.id, lines, heard_until):
        await websocket.send_json({"type": "silent", "conversation_id": body.conversation_id})
        return
    conversation_id = body.conversation_id or _new_conversation_id()
    context = ledger_context(profile.goal, lines, mentor.id)
    tokens = square.conversations.open(mentor.to_mentor(), conversation_id, context)
    await _stream(websocket, conversation_id, tokens)
    await square.profile.mark_heard(mentor.id, datetime.now(UTC))


async def _group(websocket: WebSocket, square: _Square, body: GroupChatRequest) -> None:
    conversation_id = body.conversation_id or _new_conversation_id()
    first = await square.mentors.get_mentor(body.mentor_ids[0])
    second = await square.mentors.get_mentor(body.mentor_ids[1])
    ensure_ready_to_chat(first)
    ensure_ready_to_chat(second)
    names = {first.id: first.name, second.id: second.name}
    ambient: list[tuple[str, str]] | None = None
    if body.ambient_id:
        chat = await square.ambient_store.get(body.ambient_id)
        if chat:
            ambient = [
                (names.get(line.mentor_id, line.mentor_id), line.text) for line in chat.lines
            ]

    answer: str | None = None
    for speaker, other in ((first, second), (second, first)):
        shared = await shared_context(square.profile, square.ledger, speaker.id)
        last = None if answer else await square.conversations.last_reply(other.id, conversation_id)
        group = group_context(other.name, ambient=ambient, just_said=answer, last_said=last)
        tokens = square.conversations.stream(
            speaker.to_mentor(),
            body.message,
            conversation_id,
            mentor_context="\n\n".join(part for part in (shared, group) if part),
        )
        answer = await _stream(websocket, conversation_id, tokens, mentor_id=speaker.id)
        _note_later(square.ledger_writer.record(speaker, conversation_id, body.message, answer))
    await websocket.send_json({"type": "turn_end", "conversation_id": conversation_id})
