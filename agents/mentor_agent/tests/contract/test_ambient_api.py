"""Two mentors chat about your goal, when the browser asks (never on their own)."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

from mentor_agent.models.ambient import AmbientChat, AmbientLine
from mentor_agent.models.ledger import LedgerLine
from mentor_agent.models.mentor_extract import MentorExtract
from mentor_agent.server import create_app
from mentor_agent.services.ambient import AmbientChats
from tests.fakes import (
    InMemoryAdviceLedger,
    InMemoryAmbientStore,
    InMemoryMentorService,
    InMemoryProfileService,
    ScriptedAmbientWriter,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Iterator

    from fastapi import FastAPI

NOW = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)


def _mentor(mentor_id: str, memory: str | None = "ready") -> MentorExtract:
    return MentorExtract.model_validate(
        {
            "id": mentor_id,
            "name": mentor_id.title(),
            "expertise": "e",
            "perspective": "p",
            "style": "s",
            "memory": memory,
        }
    )


def _line(mentor_id: str) -> LedgerLine:
    return LedgerLine(
        mentor_id=mentor_id, mentor_name=mentor_id, conversation_id="c", topic="t", advice="a"
    )


class _Square:
    def __init__(self, mentors: list[MentorExtract], lines: list[LedgerLine]) -> None:
        self.store = InMemoryAmbientStore()
        self.writer = ScriptedAmbientWriter()
        self.ambient = AmbientChats(
            InMemoryMentorService(mentors),  # pyright: ignore[reportArgumentType]
            InMemoryAdviceLedger(lines),
            InMemoryProfileService(),
            self.store,
            self.writer,
            clock=lambda: NOW,
        )

        @asynccontextmanager
        async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
            app.state.ambient = self.ambient
            yield

        self.app = create_app(lifespan)


@pytest.fixture
def square() -> _Square:
    return _Square([_mentor("buffett"), _mentor("dalio")], [_line("buffett"), _line("dalio")])


@pytest.fixture
def client(square: _Square) -> Iterator[TestClient]:
    with TestClient(square.app) as client:
        yield client


def test_two_eligible_mentors_chat_about_your_goal(client: TestClient, square: _Square) -> None:
    response = client.post("/api/v1/ambient", json={"mentor_ids": ["buffett", "dalio"]})

    assert response.status_code == 201
    body = response.json()
    assert body["mentor_ids"] == ["buffett", "dalio"]
    assert [line["mentor_id"] for line in body["lines"]] == ["buffett", "dalio"]
    assert [chat.id for chat in square.store.chats] == [body["id"]]


@pytest.mark.parametrize("ids", [["buffett", "buffett"], ["buffett"], ["buffett", "dalio", "x"]])
def test_a_chat_is_between_two_different_mentors(client: TestClient, ids: list[str]) -> None:
    assert client.post("/api/v1/ambient", json={"mentor_ids": ids}).status_code == 422


def test_an_unknown_mentor_is_not_found(client: TestClient) -> None:
    assert (
        client.post("/api/v1/ambient", json={"mentor_ids": ["buffett", "nobody"]}).status_code
        == 404
    )


def test_a_mentor_with_nothing_to_say_is_a_conflict() -> None:
    square = _Square([_mentor("buffett"), _mentor("dalio")], [_line("buffett")])
    with TestClient(square.app) as client:
        response = client.post("/api/v1/ambient", json={"mentor_ids": ["buffett", "dalio"]})
    assert response.status_code == 409


def test_a_second_chat_too_soon_is_refused(client: TestClient, square: _Square) -> None:
    square.store.chats.append(
        AmbientChat(
            mentor_ids=["buffett", "dalio"],
            lines=[AmbientLine(mentor_id="buffett", text="x")],
            created_at=NOW - timedelta(seconds=60),
        )
    )
    assert (
        client.post("/api/v1/ambient", json={"mentor_ids": ["buffett", "dalio"]}).status_code == 429
    )


def test_a_model_failure_stores_nothing(client: TestClient, square: _Square) -> None:
    square.writer.fail = True
    response = client.post("/api/v1/ambient", json={"mentor_ids": ["buffett", "dalio"]})
    assert response.status_code == 502
    assert square.store.chats == []
