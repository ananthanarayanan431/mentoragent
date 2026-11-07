from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from mentor_agent.config import (
    CorsSettings,
    MongoSettings,
    OpenRouterSettings,
    PathSettings,
    RagSettings,
    Settings,
)
from mentor_agent.config.base import AGENT_DIR


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


def test_every_value_in_env_example_parses(monkeypatch: pytest.MonkeyPatch) -> None:
    # A fresh install copies .env.example as is. A documented value that does not
    # parse (e.g. a blank optional number) would crash the agent on start.
    example = AGENT_DIR / ".env.example"
    for line in example.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        monkeypatch.setenv(name.strip(), value.strip())
    # The one value a fresh install must fill in (the example ships it blank).
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")

    settings = Settings()

    assert settings.mongo.CONVERSATION_TTL_SECONDS is None  # blank means keep forever


def test_blank_conversation_ttl_means_keep_forever(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MONGO_CONVERSATION_TTL_SECONDS", "")
    assert MongoSettings().CONVERSATION_TTL_SECONDS is None
    monkeypatch.setenv("MONGO_CONVERSATION_TTL_SECONDS", "3600")
    assert MongoSettings().CONVERSATION_TTL_SECONDS == 3600


def test_agent_dir_can_be_set_for_an_installed_package(tmp_path: Path) -> None:
    # In the image the package is in site-packages; MENTOR_AGENT_DIR points settings at
    # /app, so a relative data path from .env still finds the file. A subprocess,
    # because AGENT_DIR is read once at import.
    script = (
        "from mentor_agent.config import settings; "
        "print(settings.paths.EXTRACTION_METADATA_FILE_PATH)"
    )
    env = {
        **os.environ,
        "MENTOR_AGENT_DIR": str(tmp_path),
        "EXTRACTION_METADATA_FILE_PATH": "data/extraction_metadata.json",
    }
    result = subprocess.run(
        [sys.executable, "-c", script], env=env, capture_output=True, text=True, check=True
    )
    assert result.stdout.strip() == str(tmp_path / "data" / "extraction_metadata.json")


def test_a_blank_openrouter_key_fails_with_a_clear_message(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "  ")
    with pytest.raises(ValidationError, match=r"set OPENROUTER_API_KEY in \.env"):
        OpenRouterSettings()  # pyright: ignore[reportCallIssue] - API_KEY from env
