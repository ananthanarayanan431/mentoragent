from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from mentor_agent.config import settings
from mentor_agent.models.mentor_extract import MentorExtract
from mentor_agent.server import create_app
from tests.fakes import (
    InMemoryMentorService,
    RecordingMemoryBuilder,
    build_fake_conversation_service,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Iterator

    from fastapi import FastAPI

POOL = [
    MentorExtract(id=f"pool_{i}", name=f"Pool {i}", expertise="e", perspective="p", style="s")
    for i in range(3)
]


class Square:
    """The app with in-memory mentors, a pool of three and a recording memory builder."""

    def __init__(self, mentor_extract: MentorExtract) -> None:
        self.mentors = InMemoryMentorService([mentor_extract])
        self.memory = RecordingMemoryBuilder()
        service, _, _ = build_fake_conversation_service([AIMessage(content="hi")])

        @asynccontextmanager
        async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
            app.state.conversations = service
            app.state.mentors = self.mentors
            app.state.pool = POOL
            app.state.memory = self.memory
            yield

        self.client = TestClient(create_app(lifespan))


@pytest.fixture
def square(mentor_extract: MentorExtract) -> Iterator[Square]:
    built = Square(mentor_extract)
    with built.client:
        yield built


def test_pool_reports_what_is_left(square: Square) -> None:
    assert square.client.get("/api/v1/mentors/pool").json() == {"remaining": 3, "total": 3}


def test_add_random_mentor_until_the_pool_runs_out(square: Square) -> None:
    added: list[str] = []
    for _ in POOL:
        response = square.client.post("/api/v1/mentors/random")
        assert response.status_code == 201
        body = response.json()
        assert body["memory"] == "building"
        added.append(body["id"])

    assert sorted(added) == [m.id for m in POOL]
    # Each new mentor got a memory build, after the response was sent.
    assert sorted(square.memory.requested) == sorted(added)
    listed = {m["id"] for m in square.client.get("/api/v1/mentors").json()}
    assert set(added) <= listed

    exhausted = square.client.post("/api/v1/mentors/random")
    assert exhausted.status_code == 409
    assert "already in the square" in exhausted.json()["detail"]
    assert square.client.get("/api/v1/mentors/pool").json()["remaining"] == 0


def test_edit_a_mentor_and_read_its_sources(square: Square, mentor_extract: MentorExtract) -> None:
    url = f"/api/v1/mentors/{mentor_extract.id}"
    response = square.client.patch(
        url,
        json={"style": "  Brief and warm.  ", "websites": ["https://example.com/essay"]},
    )
    assert response.status_code == 200
    assert response.json()["style"] == "Brief and warm."
    assert square.client.get(f"{url}/sources").json()["websites"] == ["https://example.com/essay"]
    # Untouched fields stay as they were.
    assert response.json()["name"] == mentor_extract.name


@pytest.mark.parametrize(
    "body",
    [
        {"pdfs": ["http://insecure.example/a.pdf"]},  # https only: the server fetches these
        {"websites": ["file:///etc/passwd"]},
        {"style": ""},
        {"memory": "ready"},  # status is not editable
        {"twitter_handle": "not a handle!"},
    ],
)
def test_edits_are_validated(
    square: Square, mentor_extract: MentorExtract, body: dict[str, object]
) -> None:
    assert square.client.patch(f"/api/v1/mentors/{mentor_extract.id}", json=body).status_code == 422


def test_editing_an_unknown_mentor_is_404(square: Square) -> None:
    assert square.client.patch("/api/v1/mentors/nobody", json={"style": "x"}).status_code == 404


def test_rebuild_memory_once_at_a_time(square: Square, mentor_extract: MentorExtract) -> None:
    url = f"/api/v1/mentors/{mentor_extract.id}/memory"
    first = square.client.post(url)
    assert first.status_code == 202
    assert first.json()["memory"] == "building"
    assert square.memory.requested == [mentor_extract.id]

    # Still building (the recording builder never finishes): a second request conflicts.
    assert square.client.post(url).status_code == 409


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/mentors/random"),
        ("patch", "/api/v1/mentors/{id}"),
        ("post", "/api/v1/mentors/{id}/memory"),
        ("post", "/api/v1/reset-memory"),
    ],
)
def test_changes_need_an_api_key_in_production(
    square: Square,
    mentor_extract: MentorExtract,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    path: str,
) -> None:
    monkeypatch.setattr(settings.app, "ENVIRONMENT", "prod")
    monkeypatch.setattr(settings.app, "API_KEY", None)
    response = square.client.request(
        method.upper(), path.format(id=mentor_extract.id), json={"style": "x"}
    )
    assert response.status_code == 403
    assert square.memory.requested == []
