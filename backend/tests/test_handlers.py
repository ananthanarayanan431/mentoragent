from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from mentoragent.core.exceptions import MentorNotFoundException
from mentoragent.core.handlers import (
    REQUEST_ID_HEADER,
    register_exception_handlers,
    register_middleware,
)


class Payload(BaseModel):
    count: int


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    register_middleware(app)
    register_exception_handlers(app)

    @app.get("/ok")
    async def ok() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/missing")
    async def missing() -> None:
        raise MentorNotFoundException("ada")

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret internals")

    @app.post("/validate")
    async def validate(payload: Payload) -> Payload:
        return payload

    return TestClient(app, raise_server_exceptions=False)


def test_request_id_is_generated_and_echoed(client: TestClient) -> None:
    assert client.get("/ok").headers[REQUEST_ID_HEADER]
    response = client.get("/ok", headers={REQUEST_ID_HEADER: "abc"})
    assert response.headers[REQUEST_ID_HEADER] == "abc"


def test_domain_error_maps_to_its_status(client: TestClient) -> None:
    response = client.get("/missing")
    assert response.status_code == 404
    assert response.json() == {"detail": "Mentor for id ada not found."}


def test_unhandled_error_hides_details(client: TestClient) -> None:
    response = client.get("/boom")
    assert response.status_code == 500
    assert "secret" not in response.text


def test_validation_error_lists_fields(client: TestClient) -> None:
    response = client.post("/validate", json={"count": "many"})
    assert response.status_code == 422
    assert list(response.json()["errors"][0]) == ["body.count"]


def test_cors_allows_only_configured_origins(client: TestClient) -> None:
    preflight = {"Access-Control-Request-Method": "GET"}
    allowed = client.options("/ok", headers={"Origin": "http://allowed.test", **preflight})
    assert allowed.headers["access-control-allow-origin"] == "http://allowed.test"

    denied = client.options("/ok", headers={"Origin": "http://evil.test", **preflight})
    assert "access-control-allow-origin" not in denied.headers
