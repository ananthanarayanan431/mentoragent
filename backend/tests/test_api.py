"""API tests against the real app, with fakes installed by a test lifespan."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from pydantic import SecretStr
from starlette.websockets import WebSocketDisconnect

from mentoragent.api.main import create_app
from mentoragent.core.config import settings
from tests.fakes import InMemoryMentorService, build_fake_conversation_service, tool_call

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Iterator

    from fastapi import FastAPI

    from mentoragent.models.mentor_extract import MentorExtract


def _client(mentor_extract: MentorExtract, responses: list[AIMessage]) -> TestClient:
    service, _, _ = build_fake_conversation_service(responses)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.conversations = service
        app.state.mentors = InMemoryMentorService([mentor_extract])
        yield

    return TestClient(create_app(lifespan))


@pytest.fixture
def client(mentor_extract: MentorExtract) -> Iterator[TestClient]:
    with _client(mentor_extract, [AIMessage(content="Hello from Ada.")]) as client:
        yield client


@pytest.fixture
def api_key(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(settings.app, "API_KEY", SecretStr("s3cret"))
    return "s3cret"


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_list_and_get_mentors(client: TestClient) -> None:
    mentors = client.get("/api/v1/mentors").json()
    assert [m["id"] for m in mentors] == ["ada"]
    assert "pdfs" not in mentors[0]  # sources are not exposed

    assert client.get("/api/v1/mentors/ada").json()["name"] == "Ada Lovelace"
    assert client.get("/api/v1/mentors/nobody").status_code == 404


def test_chat_starts_and_continues_a_conversation(client: TestClient) -> None:
    first = client.post("/api/v1/chat", json={"mentor_id": "ada", "message": "Hi"})
    assert first.status_code == 200
    body = first.json()
    assert body["response"] == "Hello from Ada."
    assert body["conversation_id"]

    second = client.post(
        "/api/v1/chat",
        json={"mentor_id": "ada", "message": "Again", "conversation_id": body["conversation_id"]},
    )
    assert second.json()["conversation_id"] == body["conversation_id"]


@pytest.mark.parametrize(
    "payload",
    [
        {"mentor_id": "ada", "message": "   "},
        {"mentor_id": "ada", "message": "x" * (settings.agent.MAX_MESSAGE_CHARS + 1)},
        {"mentor_id": "ada", "message": "hi", "conversation_id": "../../etc"},
        {"mentor_id": "ada", "message": "hi", "unexpected": True},
    ],
)
def test_chat_rejects_invalid_input(client: TestClient, payload: dict[str, Any]) -> None:
    assert client.post("/api/v1/chat", json=payload).status_code == 422


def test_chat_unknown_mentor_is_404(client: TestClient) -> None:
    response = client.post("/api/v1/chat", json={"mentor_id": "nobody", "message": "Hi"})
    assert response.status_code == 404


def test_delete_conversation(client: TestClient) -> None:
    assert client.delete("/api/v1/conversations/ada/abc123").status_code == 204


def test_api_key_is_enforced_when_configured(client: TestClient, api_key: str) -> None:
    assert client.get("/api/v1/mentors").status_code == 403
    assert client.get("/api/v1/mentors", headers={"X-API-Key": "wrong"}).status_code == 403
    assert client.get("/api/v1/mentors", headers={"X-API-Key": api_key}).status_code == 200
    assert client.get("/health").status_code == 200  # probes stay open


def test_websocket_streams_a_reply(mentor_extract: MentorExtract) -> None:
    responses = [tool_call("q"), AIMessage(content="Streamed reply here")]
    with (
        _client(mentor_extract, responses) as client,
        client.websocket_connect("/api/v1/ws/chat") as ws,
    ):
        ws.send_json({"mentor_id": "ada", "message": "Hi"})
        events = [ws.receive_json()]
        while events[-1]["type"] not in {"end", "error"}:
            events.append(ws.receive_json())

    assert events[0]["type"] == "start"
    assert "".join(e["content"] for e in events if e["type"] == "chunk") == "Streamed reply here"
    assert events[-1] == {
        "type": "end",
        "conversation_id": events[0]["conversation_id"],
        "response": "Streamed reply here",
    }


def test_websocket_reports_errors_and_keeps_connection(client: TestClient) -> None:
    with client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.send_json({"message": "missing mentor id"})
        assert ws.receive_json()["type"] == "error"

        ws.send_json({"mentor_id": "nobody", "message": "Hi"})
        error = ws.receive_json()
        assert error == {"type": "error", "detail": "Mentor for id nobody not found."}

        ws.send_json({"mentor_id": "ada", "message": "Hi"})
        assert ws.receive_json()["type"] == "start"


def test_websocket_requires_api_key_when_configured(client: TestClient, api_key: str) -> None:
    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/api/v1/ws/chat") as ws:
        ws.receive_json()

    with client.websocket_connect(f"/api/v1/ws/chat?api_key={api_key}") as ws:
        ws.send_json({"mentor_id": "ada", "message": "Hi"})
        assert ws.receive_json()["type"] == "start"
