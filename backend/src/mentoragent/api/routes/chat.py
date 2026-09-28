from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, WebSocket, WebSocketDisconnect, status
from loguru import logger
from pydantic import ValidationError

from mentoragent.api.dependencies import (
    ConversationServiceDep,
    MentorServiceDep,
    require_websocket_api_key,
)
from mentoragent.api.schemas import ChatRequest, ChatResponse, ConversationId
from mentoragent.core.exceptions import MentorAgentError, unpack_validation_error

router = APIRouter(tags=["chat"])
websocket_router = APIRouter(tags=["chat"])


def _new_conversation_id() -> str:
    return uuid.uuid4().hex


@router.post("/chat")
async def chat(
    body: ChatRequest, mentors: MentorServiceDep, conversations: ConversationServiceDep
) -> ChatResponse:
    """Send a message to a mentor and get the full reply."""
    mentor = await mentors.get_mentor(body.mentor_id)
    conversation_id = body.conversation_id or _new_conversation_id()
    reply = await conversations.respond(mentor.to_mentor(), body.message, conversation_id)
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
    websocket: WebSocket, mentors: MentorServiceDep, conversations: ConversationServiceDep
) -> None:
    """Stream mentor replies over a WebSocket.

    Client -> server, one JSON object per message (same shape as ``POST /chat``)::

        {"mentor_id": "...", "message": "...", "conversation_id": "..."?}

    Server -> client events::

        {"type": "start", "conversation_id": "..."}
        {"type": "chunk", "content": "..."}         (repeated)
        {"type": "end", "conversation_id": "...", "response": "..."}
        {"type": "error", "detail": ...}

    An error ends the current turn, not the connection.
    """
    await websocket.accept()
    try:
        while True:
            try:
                body = ChatRequest.model_validate(await websocket.receive_json())
            except ValidationError as exc:
                await websocket.send_json(
                    {"type": "error", "detail": unpack_validation_error(exc)["errors"]}
                )
                continue
            except ValueError:
                await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
                continue

            conversation_id = body.conversation_id or _new_conversation_id()
            try:
                mentor = await mentors.get_mentor(body.mentor_id)
                await websocket.send_json({"type": "start", "conversation_id": conversation_id})
                parts: list[str] = []
                async for token in conversations.stream(
                    mentor.to_mentor(), body.message, conversation_id
                ):
                    parts.append(token)
                    await websocket.send_json({"type": "chunk", "content": token})
                await websocket.send_json(
                    {"type": "end", "conversation_id": conversation_id, "response": "".join(parts)}
                )
            except MentorAgentError as exc:
                await websocket.send_json({"type": "error", "detail": exc.message})
            except WebSocketDisconnect:
                raise
            except Exception:
                logger.exception("Unexpected error in WebSocket chat")
                await websocket.send_json({"type": "error", "detail": "Internal Server Error"})
    except WebSocketDisconnect:
        logger.debug("WebSocket client disconnected")
    except RuntimeError:
        # Sending after the client went away mid-stream.
        logger.debug("WebSocket closed during send")
    else:  # pragma: no cover - loop only exits via exceptions
        await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)
