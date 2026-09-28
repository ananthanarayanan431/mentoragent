from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from mentoragent.core.config import CorsSettings, OpenRouterSettings, PathSettings, RagSettings
from mentoragent.core.config.base import BACKEND_DIR


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://a.test, http://b.test", ["http://a.test", "http://b.test"]),
        ("http://a.test;http://b.test;", ["http://a.test", "http://b.test"]),
        ("", []),
    ],
)
def test_cors_origins_parse_separators(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: list[str]
) -> None:
    monkeypatch.setenv("ADDITIONAL_CORS_ORIGINS", raw)
    assert CorsSettings().ADDITIONAL_CORS_ORIGINS == expected


def test_rag_rejects_overlap_not_smaller_than_chunk() -> None:
    with pytest.raises(ValidationError, match="must be smaller"):
        RagSettings(CHUNK_SIZE=100, CHUNK_OVERLAP=100)


def test_api_keys_are_masked_in_repr() -> None:
    openrouter = OpenRouterSettings()
    assert "test-openrouter-key" not in repr(openrouter)
    assert openrouter.API_KEY.get_secret_value() == "test-openrouter-key"


def test_relative_paths_resolve_against_backend_dir() -> None:
    relative = PathSettings(EVALUATION_DATASET_FILE_PATH=Path("data/x.json"))
    assert relative.EVALUATION_DATASET_FILE_PATH == BACKEND_DIR / "data/x.json"

    absolute = PathSettings(EVALUATION_DATASET_FILE_PATH=Path("/abs/x.json"))
    assert absolute.EVALUATION_DATASET_FILE_PATH == Path("/abs/x.json")
