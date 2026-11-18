"""Every mentor reads the user's goal and what the other mentors advised."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, SystemMessage
from starlette.websockets import WebSocketDisconnect

from mentor_agent.models.ledger import LedgerLine
from mentor_agent.server import create_app
from tests.fakes import (
    InMemoryAdviceLedger,
    InMemoryAmbientStore,
    InMemoryMentorService,
    InMemorySquareService,
    RecordingLedgerWriter,
    ScriptedChatModel,
    build_fake_conversation_service,
    default_square,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from fastapi import FastAPI

    from mentor_agent.models.mentor_extract import MentorExtract

MUNGER_LINE = LedgerLine(
    mentor_id="munger",
    mentor_name="Charlie Munger",
    conversation_id="c0",
    topic="concentration",
    advice="Recommends owning a few great businesses.",
)
OWN_LINE = LedgerLine(
    mentor_id="ada",
    mentor_name="Ada Lovelace",
    conversation_id="c0",
    topic="engines",
    advice="Recommends studying the engine.",
)


def _client(
    mentor_extract: MentorExtract, ledger: InMemoryAdviceLedger
) -> tuple[TestClient, ScriptedChatModel]:
    service, model, _ = build_fake_conversation_service([AIMessage(content="Noted.")])

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        app.state.conversations = service
        app.state.mentors = InMemoryMentorService([mentor_extract])
        app.state.squares = InMemorySquareService(default_square(goal="Retire by 45"))
        app.state.ledger = ledger
        app.state.ledger_writer = RecordingLedgerWriter()
        app.state.ambient_store = InMemoryAmbientStore()
        yield

    return TestClient(create_app(lifespan)), model


def _system_prompt(model: ScriptedChatModel) -> str:
    first = model.received[-1][0]
    assert isinstance(first, SystemMessage)
    return str(first.content)


def test_a_mentor_reads_the_goal_and_the_others_advice(mentor_extract: MentorExtract) -> None:
    client, model = _client(mentor_extract, InMemoryAdviceLedger([MUNGER_LINE, OWN_LINE]))
    with client:
        client.post("/api/v1/chat", json={"mentor_id": "ada", "message": "Should I diversify?"})

    prompt = _system_prompt(model)
    assert "The user's goal: Retire by 45" in prompt
    assert "Charlie Munger advised, on concentration" in prompt
    assert "Recommends studying the engine." not in prompt


def test_the_streamed_reply_reads_them_too(mentor_extract: MentorExtract) -> None:
    client, model = _client(mentor_extract, InMemoryAdviceLedger([MUNGER_LINE]))
    with client, client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"mentor_id": "ada", "message": "Should I diversify?"})
        while ws.receive_json()["type"] not in {"end", "error"}:
            pass

    assert "Charlie Munger advised, on concentration" in _system_prompt(model)


class _BrokenLedger(InMemoryAdviceLedger):
    async def recent(self, square_id: str, limit: int) -> list[LedgerLine]:
        from pymongo.errors import PyMongoError

        msg = "database down"
        raise PyMongoError(msg)


def test_a_mentor_still_answers_when_the_ledger_cannot_be_read(
    mentor_extract: MentorExtract,
) -> None:
    client, _ = _client(mentor_extract, _BrokenLedger())
    with client:
        response = client.post("/api/v1/chat", json={"mentor_id": "ada", "message": "Hi"})
    assert response.status_code == 200


def test_advice_from_another_square_is_never_read(mentor_extract: MentorExtract) -> None:
    elsewhere = MUNGER_LINE.model_copy(update={"square_id": "cricket"})
    client, model = _client(mentor_extract, InMemoryAdviceLedger([elsewhere]))
    with client:
        client.post("/api/v1/chat", json={"mentor_id": "ada", "message": "Should I diversify?"})

    assert "Charlie Munger" not in _system_prompt(model)


def test_the_same_conversation_id_in_two_squares_shares_no_history(
    mentor_extract: MentorExtract,
) -> None:
    client, model = _client(mentor_extract, InMemoryAdviceLedger())
    with client:
        other = client.post("/api/v1/squares", json={"name": "Cricket"}).json()["id"]
        body = {"mentor_id": "ada", "message": "Remember the word heron.", "conversation_id": "c1"}
        client.post("/api/v1/chat", json=body)
        client.post(
            "/api/v1/chat",
            json={**body, "message": "What word?"},
            headers={"X-Square-Id": other},
        )

    seen = " ".join(str(m.content) for m in model.received[-1])
    assert "heron" not in seen


def test_a_socket_reads_only_its_own_square(mentor_extract: MentorExtract) -> None:
    client, model = _client(mentor_extract, InMemoryAdviceLedger([MUNGER_LINE]))
    with client:
        other = client.post("/api/v1/squares", json={"name": "Cricket"}).json()["id"]
        with client.websocket_connect(f"/api/v1/ws/chat?square_id={other}") as ws:
            ws.send_json({"mentor_id": "ada", "message": "Should I diversify?"})
            while ws.receive_json()["type"] not in {"end", "error"}:
                pass

    assert "Charlie Munger" not in _system_prompt(model)


def test_a_socket_for_an_unknown_square_is_closed(mentor_extract: MentorExtract) -> None:
    client, _ = _client(mentor_extract, InMemoryAdviceLedger())
    with (
        client,
        pytest.raises(WebSocketDisconnect) as closed,
        client.websocket_connect("/api/v1/ws/chat?square_id=nowhere") as ws,
    ):
        ws.receive_json()
    assert closed.value.code == 1008
