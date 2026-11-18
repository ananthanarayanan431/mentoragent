"""The square's shared state over HTTP: your goal and the advice ledger."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

from mentor_agent.models.ledger import LedgerLine
from mentor_agent.server import create_app
from tests.fakes import InMemoryAdviceLedger, InMemoryAmbientStore, InMemorySquareService

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Iterator

    from fastapi import FastAPI


NOW = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)


def _line(n: int, mentor_id: str = "warren_buffett") -> LedgerLine:
    return LedgerLine(
        id=f"line{n}",
        mentor_id=mentor_id,
        mentor_name="Warren Buffett",
        conversation_id="c1",
        topic=f"topic {n}",
        advice=f"advice {n}",
        created_at=NOW + timedelta(minutes=n),
    )


@pytest.fixture
def ledger() -> InMemoryAdviceLedger:
    return InMemoryAdviceLedger([_line(1), _line(2), _line(3)])


@pytest.fixture
def squares() -> InMemorySquareService:
    return InMemorySquareService()


@pytest.fixture
def client(ledger: InMemoryAdviceLedger, squares: InMemorySquareService) -> Iterator[TestClient]:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
        app.state.squares = squares
        app.state.ambient_store = InMemoryAmbientStore()
        app.state.ledger = ledger
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


def test_the_ledger_lists_the_newest_advice_first(client: TestClient) -> None:
    lines = client.get("/api/v1/ledger").json()
    assert [line["id"] for line in lines] == ["line3", "line2", "line1"]
    assert lines[0] == {
        "id": "line3",
        "mentor_id": "warren_buffett",
        "mentor_name": "Warren Buffett",
        "topic": "topic 3",
        "advice": "advice 3",
        "created_at": "2026-11-15T12:03:00Z",
    }


def test_the_ledger_honours_the_limit(client: TestClient) -> None:
    assert [line["id"] for line in client.get("/api/v1/ledger?limit=2").json()] == [
        "line3",
        "line2",
    ]


@pytest.mark.parametrize("limit", [0, 201])
def test_a_limit_out_of_range_is_refused(client: TestClient, limit: int) -> None:
    assert client.get(f"/api/v1/ledger?limit={limit}").status_code == 422


def test_a_line_can_be_forgotten(client: TestClient, ledger: InMemoryAdviceLedger) -> None:
    assert client.delete("/api/v1/ledger/line2").status_code == 204
    assert [line.id for line in ledger.lines] == ["line1", "line3"]


def test_forgetting_an_unknown_line_is_not_found(client: TestClient) -> None:
    assert client.delete("/api/v1/ledger/nope").status_code == 404


def _in(square_id: str) -> dict[str, str]:
    return {"X-Square-Id": square_id}


def test_the_first_square_is_there_from_the_start(client: TestClient) -> None:
    [first] = client.get("/api/v1/squares").json()
    assert (first["id"], first["name"], first["mentor_ids"]) == ("main", "My square", [])


def test_make_rename_and_delete_a_square(client: TestClient) -> None:
    made = client.post("/api/v1/squares", json={"name": " Cricket ", "goal": "Bat longer"})
    assert made.status_code == 201
    square_id = made.json()["id"]
    assert (made.json()["name"], made.json()["goal"]) == ("Cricket", "Bat longer")

    renamed = client.patch(f"/api/v1/squares/{square_id}", json={"name": "Nets"})
    assert renamed.json()["name"] == "Nets"
    assert renamed.json()["goal"] == "Bat longer"  # untouched
    assert [s["name"] for s in client.get("/api/v1/squares").json()] == ["My square", "Nets"]

    assert client.delete(f"/api/v1/squares/{square_id}").status_code == 204
    assert client.get(f"/api/v1/squares/{square_id}").status_code == 404


def test_your_only_square_cannot_be_deleted(client: TestClient) -> None:
    response = client.delete("/api/v1/squares/main")
    assert response.status_code == 409
    assert "only square" in response.json()["detail"]


@pytest.mark.parametrize(
    "body", [{"name": ""}, {"name": "x" * 61}, {"name": "A", "goal": "x" * 281}]
)
def test_a_bad_square_is_refused(client: TestClient, body: dict[str, str]) -> None:
    assert client.post("/api/v1/squares", json=body).status_code == 422


def test_each_square_has_its_own_goal(client: TestClient) -> None:
    other = client.post("/api/v1/squares", json={"name": "Cricket"}).json()["id"]
    client.put("/api/v1/goal", json={"goal": "Retire by 45"})
    client.put("/api/v1/goal", json={"goal": "Bat longer"}, headers=_in(other))

    assert client.get("/api/v1/goal").json() == {"goal": "Retire by 45"}
    assert client.get("/api/v1/goal", headers=_in(other)).json() == {"goal": "Bat longer"}


def test_each_square_has_its_own_ledger(client: TestClient, ledger: InMemoryAdviceLedger) -> None:
    other = client.post("/api/v1/squares", json={"name": "Cricket"}).json()["id"]
    ledger.lines.append(_line(9).model_copy(update={"id": "nets", "square_id": other}))

    assert [line["id"] for line in client.get("/api/v1/ledger").json()] == [
        "line3",
        "line2",
        "line1",
    ]
    assert [line["id"] for line in client.get("/api/v1/ledger", headers=_in(other)).json()] == [
        "nets"
    ]
    # A line can only be forgotten from the square it belongs to.
    assert client.delete("/api/v1/ledger/nets").status_code == 404
    assert client.delete("/api/v1/ledger/nets", headers=_in(other)).status_code == 204


def test_deleting_a_square_forgets_what_was_said_there(
    client: TestClient, ledger: InMemoryAdviceLedger
) -> None:
    other = client.post("/api/v1/squares", json={"name": "Cricket"}).json()["id"]
    ledger.lines.append(_line(9).model_copy(update={"id": "nets", "square_id": other}))

    client.delete(f"/api/v1/squares/{other}")

    assert [line.id for line in ledger.lines] == ["line1", "line2", "line3"]


def test_an_unknown_square_is_not_found(client: TestClient) -> None:
    assert client.get("/api/v1/goal", headers=_in("nowhere")).status_code == 404
    assert client.get("/api/v1/ledger", headers=_in("nowhere")).status_code == 404
