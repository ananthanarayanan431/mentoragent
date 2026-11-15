"""A mentor who has heard something new from the others speaks first."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage

from mentor_agent.models.ledger import LedgerLine
from mentor_agent.server import create_app
from tests.fakes import (
    InMemoryAdviceLedger,
    InMemoryAmbientStore,
    InMemoryMentorService,
    InMemoryProfileService,
    RecordingLedgerWriter,
    build_fake_conversation_service,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from fastapi import FastAPI
    from starlette.testclient import WebSocketTestSession

    from mentor_agent.models.mentor_extract import MentorExtract

MUNGER_LINE = LedgerLine(
    mentor_id="munger",
    mentor_name="Charlie Munger",
    conversation_id="c0",
    topic="concentration",
    advice="Recommends owning a few great businesses.",
)
OPENER = "I hear Charlie told you to concentrate. Careful with that."


class _Setup:
    def __init__(self, mentor: MentorExtract, lines: list[LedgerLine]) -> None:
        service, self.model, _ = build_fake_conversation_service(
            [AIMessage(content=OPENER), AIMessage(content="A real answer.")]
        )
        self.profile = InMemoryProfileService()
        self.writer = RecordingLedgerWriter()

        @asynccontextmanager
        async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
            app.state.conversations = service
            app.state.mentors = InMemoryMentorService([mentor])
            app.state.profile = self.profile
            app.state.ledger = InMemoryAdviceLedger(lines)
            app.state.ledger_writer = self.writer
            app.state.ambient_store = InMemoryAmbientStore()
            yield

        self.client = TestClient(create_app(lifespan))


def _turn(ws: WebSocketTestSession, request: dict[str, Any]) -> list[dict[str, Any]]:
    ws.send_json(request)
    events = [ws.receive_json()]
    while events[-1]["type"] not in {"end", "error", "silent"}:
        events.append(ws.receive_json())
    return events


def test_a_mentor_opens_with_what_they_heard(mentor_extract: MentorExtract) -> None:
    setup = _Setup(mentor_extract, [MUNGER_LINE])
    with setup.client, setup.client.websocket_connect("/api/v1/ws/chat") as ws:
        events = _turn(ws, {"mentor_id": "ada", "opener": True})

    assert events[0]["type"] == "start"
    assert events[-1] == {
        "type": "end",
        "conversation_id": events[0]["conversation_id"],
        "response": OPENER,
    }
    assert "ada" in setup.profile.profile.heard_until
    assert setup.writer.calls == []  # an opener is not advice given in answer to you


def test_nothing_new_means_silence_and_no_model_call(mentor_extract: MentorExtract) -> None:
    setup = _Setup(mentor_extract, [])
    with setup.client, setup.client.websocket_connect("/api/v1/ws/chat") as ws:
        events = _turn(ws, {"mentor_id": "ada", "opener": True, "conversation_id": "c1"})

    assert events == [{"type": "silent", "conversation_id": "c1"}]
    assert setup.model.received == []


def test_a_mentor_does_not_open_twice_with_the_same_news(mentor_extract: MentorExtract) -> None:
    setup = _Setup(mentor_extract, [MUNGER_LINE])
    with setup.client, setup.client.websocket_connect("/api/v1/ws/chat") as ws:
        first = _turn(ws, {"mentor_id": "ada", "opener": True})
        again = _turn(ws, {"mentor_id": "ada", "opener": True})

    assert first[-1]["type"] == "end"
    assert again[-1]["type"] == "silent"


def test_a_mentor_whose_memory_builds_stays_silent(mentor_extract: MentorExtract) -> None:
    building = mentor_extract.model_copy(update={"memory": "building"})
    setup = _Setup(building, [MUNGER_LINE])
    with setup.client, setup.client.websocket_connect("/api/v1/ws/chat") as ws:
        assert _turn(ws, {"mentor_id": "ada", "opener": True})[-1]["type"] == "silent"


def test_the_opener_is_part_of_the_conversation(mentor_extract: MentorExtract) -> None:
    setup = _Setup(mentor_extract, [MUNGER_LINE])
    with setup.client, setup.client.websocket_connect("/api/v1/ws/chat") as ws:
        conversation_id = _turn(ws, {"mentor_id": "ada", "opener": True})[0]["conversation_id"]
        reply = _turn(
            ws, {"mentor_id": "ada", "message": "Why careful?", "conversation_id": conversation_id}
        )

    assert reply[-1]["response"] == "A real answer."
    history = setup.model.received[-1][1:]  # after the system prompt
    assert [type(m) for m in history] == [AIMessage, HumanMessage]
    assert history[0].content == OPENER
