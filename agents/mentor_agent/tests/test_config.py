from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from mentor_agent.core.config import CorsSettings, OpenRouterSettings, PathSettings, RagSettings
from mentor_agent.core.config.base import AGENT_DIR


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
    openrouter = OpenRouterSettings()  # pyright: ignore[reportCallIssue] - API_KEY from env
    assert "test-openrouter-key" not in repr(openrouter)
    assert openrouter.API_KEY.get_secret_value() == "test-openrouter-key"


def test_relative_paths_resolve_against_agent_dir() -> None:
    relative = PathSettings(EVALUATION_DATASET_FILE_PATH=Path("data/x.json"))
    assert relative.EVALUATION_DATASET_FILE_PATH == AGENT_DIR / "data/x.json"

    absolute = PathSettings(EVALUATION_DATASET_FILE_PATH=Path("/abs/x.json"))
    assert absolute.EVALUATION_DATASET_FILE_PATH == Path("/abs/x.json")


def test_agent_dir_is_the_agent_folder() -> None:
    # .env and data/ are looked up here; a wrong parents[] index fails silently.
    assert (AGENT_DIR / "pyproject.toml").is_file()
    assert (AGENT_DIR / "data" / "extraction_metadata.json").is_file()
