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
    RecordingEnricher,
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
        self.enricher = RecordingEnricher()
        service, _, _ = build_fake_conversation_service([AIMessage(content="hi")])

        @asynccontextmanager
        async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
            app.state.conversations = service
            app.state.mentors = self.mentors
            app.state.pool = POOL
            app.state.memory = self.memory
            app.state.enricher = self.enricher
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


def test_remove_a_mentor_and_add_them_back(square: Square) -> None:
    added = square.client.post("/api/v1/mentors/random").json()["id"]
    # Let the (recorded, never finished) build end so the mentor can be removed.
    square.mentors.mentors[added] = square.mentors.mentors[added].model_copy(
        update={"memory": "ready"}
    )

    assert square.client.delete(f"/api/v1/mentors/{added}").status_code == 204
    assert square.memory.forgotten == [added]
    assert square.client.get(f"/api/v1/mentors/{added}").status_code == 404
    # Back in the pool: "Add a mentor" can bring them in again.
    assert square.client.get("/api/v1/mentors/pool").json()["remaining"] == len(POOL)


def test_a_mentor_is_not_removed_while_their_memory_builds(square: Square) -> None:
    added = square.client.post("/api/v1/mentors/random").json()["id"]
    response = square.client.delete(f"/api/v1/mentors/{added}")
    assert response.status_code == 409
    assert square.memory.forgotten == []
    assert square.client.get(f"/api/v1/mentors/{added}").status_code == 200


def test_removing_an_unknown_mentor_is_404(square: Square) -> None:
    assert square.client.delete("/api/v1/mentors/nobody").status_code == 404


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/mentors/random"),
        ("patch", "/api/v1/mentors/{id}"),
        ("delete", "/api/v1/mentors/{id}"),
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
    assert square.memory.forgotten == []


# Mentors described by the user

URL = "/api/v1/mentors"


def test_create_a_mentor_then_research_them_in_the_background(square: Square) -> None:
    response = square.client.post(
        URL,
        json={
            "name": "  Grace Hopper ",
            "youtube_videos": ["https://www.youtube.com/watch?v=abc"],
            "websites": ["https://example.test/about"],
            "notes": ["A LinkedIn post about compilers."],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert (body["id"], body["name"], body["memory"]) == (
        "grace_hopper",
        "Grace Hopper",
        "building",
    )
    # A placeholder persona until the research fills it in.
    assert "Grace Hopper" in body["expertise"]
    # Research (on by default) and the memory build run after the response.
    assert square.enricher.calls == [("grace_hopper", True, ["expertise", "perspective", "style"])]

    sources = square.client.get(f"{URL}/grace_hopper/sources").json()
    assert sources["websites"] == ["https://example.test/about"]
    assert sources["youtube_videos"] == ["https://www.youtube.com/watch?v=abc"]
    assert sources["notes"] == ["A LinkedIn post about compilers."]
    assert sources["search_wikipedia"] is False


def test_persona_fields_given_are_kept_and_only_the_rest_are_written(square: Square) -> None:
    body = square.client.post(
        URL, json={"name": "Grace Hopper", "style": "Blunt", "research": False}
    ).json()

    assert body["style"] == "Blunt"
    assert square.enricher.calls == [("grace_hopper", False, ["expertise", "perspective"])]


def test_two_mentors_with_one_name_get_different_ids(square: Square) -> None:
    first = square.client.post(URL, json={"name": "Ada Lovelace"}).json()
    second = square.client.post(URL, json={"name": "Ada Lovelace"}).json()
    assert (first["id"], second["id"]) == ("ada_lovelace", "ada_lovelace_2")


def test_bad_input_is_rejected(square: Square) -> None:
    assert square.client.post(URL, json={"name": "  "}).status_code == 422
    insecure = {"name": "X", "websites": ["http://insecure.test"]}
    assert square.client.post(URL, json=insecure).status_code == 422
    assert square.client.post(URL, json={"name": "X", "unknown": 1}).status_code == 422
    assert square.enricher.calls == []
