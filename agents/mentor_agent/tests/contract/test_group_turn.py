"""One message to two mentors: the first answers, then the second, having read the first."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, SystemMessage

from mentor_agent.models.ambient import AmbientChat, AmbientLine
from mentor_agent.models.mentor_extract import MentorExtract
from mentor_agent.server import create_app
from tests.fakes import (
    InMemoryAdviceLedger,
    InMemoryAmbientStore,
    InMemoryMentorService,
    InMemorySquareService,
    RecordingLedgerWriter,
    ScriptedChatModel,
    build_fake_conversation_service,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from fastapi import FastAPI
    from starlette.testclient import WebSocketTestSession


def _mentor(mentor_id: str, name: str, memory: str | None = "ready") -> MentorExtract:
    return MentorExtract.model_validate(
        {
            "id": mentor_id,
            "name": name,
            "expertise": "e",
            "perspective": "p",
            "style": "s",
            "memory": memory,
        }
    )


BUFFETT = _mentor("buffett", "Warren Buffett")
MUNGER = _mentor("munger", "Charlie Munger")
CHAT = AmbientChat(
    id="amb1",
    mentor_ids=["buffett", "munger"],
    lines=[
        AmbientLine(mentor_id="buffett", text="Our friend should buy index funds."),
        AmbientLine(mentor_id="munger", text="Agreed, and avoid fees."),
    ],
)


class _Setup:
    def __init__(self, mentors: list[MentorExtract]) -> None:
        service, self.model, _ = build_fake_conversation_service(
            [AIMessage(content="Buy an index fund."), AIMessage(content="I would add: avoid fees.")]
        )
        self.writer = RecordingLedgerWriter()
        store = InMemoryAmbientStore()
        store.chats.append(CHAT)

        @asynccontextmanager
        async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
            app.state.conversations = service
            app.state.mentors = InMemoryMentorService(mentors)
            app.state.squares = InMemorySquareService()
            app.state.ledger = InMemoryAdviceLedger()
            app.state.ledger_writer = self.writer
            app.state.ambient_store = store
            yield

        self.client = TestClient(create_app(lifespan))


def _turn(ws: WebSocketTestSession, request: dict[str, Any]) -> list[dict[str, Any]]:
    ws.send_json(request)
    events = [ws.receive_json()]
    while events[-1]["type"] not in {"turn_end", "error"}:
        events.append(ws.receive_json())
    return events


def _system_prompt(model: ScriptedChatModel, call: int) -> str:
    first = model.received[call][0]
    assert isinstance(first, SystemMessage)
    return str(first.content)


def test_both_mentors_answer_in_turn_each_tagged() -> None:
    setup = _Setup([BUFFETT, MUNGER])
    with setup.client, setup.client.websocket_connect("/api/v1/ws/chat") as ws:
        events = _turn(ws, {"mentor_ids": ["buffett", "munger"], "message": "How should I invest?"})

    ends = [e for e in events if e["type"] == "end"]
    assert [(e["mentor_id"], e["response"]) for e in ends] == [
        ("buffett", "Buy an index fund."),
        ("munger", "I would add: avoid fees."),
    ]
    assert all("mentor_id" in e for e in events if e["type"] in {"start", "chunk", "end"})
    assert events[-1] == {"type": "turn_end", "conversation_id": ends[0]["conversation_id"]}
    assert [call[0] for call in setup.writer.calls] == ["buffett", "munger"]


def test_the_second_mentor_reads_the_first_and_both_remember_their_chat() -> None:
    setup = _Setup([BUFFETT, MUNGER])
    with setup.client, setup.client.websocket_connect("/api/v1/ws/chat") as ws:
        _turn(
            ws,
            {
                "mentor_ids": ["buffett", "munger"],
                "message": "How should I invest?",
                "ambient_id": "amb1",
            },
        )

    first, second = _system_prompt(setup.model, 0), _system_prompt(setup.model, 1)
    assert "Charlie Munger: Agreed, and avoid fees." in first
    assert "Warren Buffett just answered the user: Buy an index fund." in second


def test_a_mentor_still_reading_up_stops_the_turn() -> None:
    setup = _Setup([BUFFETT, _mentor("munger", "Charlie Munger", "building")])
    with setup.client, setup.client.websocket_connect("/api/v1/ws/chat") as ws:
        events = _turn(ws, {"mentor_ids": ["buffett", "munger"], "message": "Hi"})

    assert [e["type"] for e in events] == ["error"]
    assert setup.model.received == []


def test_a_group_of_one_is_refused() -> None:
    setup = _Setup([BUFFETT, MUNGER])
    with setup.client, setup.client.websocket_connect("/api/v1/ws/chat") as ws:
        events = _turn(ws, {"mentor_ids": ["buffett", "buffett"], "message": "Hi"})
    assert events[0]["type"] == "error"
