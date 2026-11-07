from __future__ import annotations

import json
from typing import TYPE_CHECKING, cast

from mentor_agent.export_openapi import main, openapi_document

if TYPE_CHECKING:
    import pytest


def test_info_does_not_depend_on_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    # The web contract is diffed in CI, so a local PROJECT_NAME must not leak in.
    monkeypatch.setenv("PROJECT_NAME", "Something else")
    info = openapi_document()["info"]
    assert info == {"title": "MentorAgents mentor agent", "version": "0.1.0"}


def test_every_route_is_in_the_contract() -> None:
    paths = cast("dict[str, object]", openapi_document()["paths"])
    assert {
        "/api/v1/chat",
        "/api/v1/mentors",
        "/api/v1/mentors/{mentor_id}",
        "/api/v1/conversations/{mentor_id}/{conversation_id}",
        "/api/v1/reset-memory",
        "/health",
        "/ready",
    } <= set(paths)


def test_main_prints_stable_json(capsys: pytest.CaptureFixture[str]) -> None:
    main()
    first = capsys.readouterr().out
    main()
    assert capsys.readouterr().out == first
    assert json.loads(first)["openapi"].startswith("3.")
