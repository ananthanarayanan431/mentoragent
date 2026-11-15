"""The square's shared state over HTTP: your goal."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

from mentor_agent.server import create_app
from tests.fakes import InMemoryProfileService

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Iterator

    from fastapi import FastAPI


@pytest.fixture
def client() -> Iterator[TestClient]:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        app.state.profile = InMemoryProfileService()
        yield

    with TestClient(create_app(lifespan)) as client:
        yield client


def test_there_is_no_goal_at_first(client: TestClient) -> None:
    assert client.get("/api/v1/goal").json() == {"goal": None}


def test_a_goal_is_trimmed_stored_and_read_back(client: TestClient) -> None:
    response = client.put("/api/v1/goal", json={"goal": "  Retire by 45  "})
    assert response.status_code == 200
    assert response.json() == {"goal": "Retire by 45"}
    assert client.get("/api/v1/goal").json() == {"goal": "Retire by 45"}


@pytest.mark.parametrize("goal", ["", "   ", "x" * 281])
def test_a_blank_or_too_long_goal_is_refused(client: TestClient, goal: str) -> None:
    assert client.put("/api/v1/goal", json={"goal": goal}).status_code == 422
