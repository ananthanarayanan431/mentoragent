from __future__ import annotations

import re
from typing import TYPE_CHECKING, cast

import pytest
from langchain_core.messages import AIMessage
from typer.testing import CliRunner

from mentor_agent.cli import app, call_mentor
from mentor_agent.errors import MentorNotFoundError
from tests.fakes import InMemoryMentorService, build_fake_conversation_service

if TYPE_CHECKING:
    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.mentors import MentorService


def _mentors(mentor_extract: MentorExtract) -> MentorService:
    # The in-memory fake has the same interface as MentorService.
    return cast("MentorService", InMemoryMentorService([mentor_extract]))


async def test_call_streams_the_reply(mentor_extract: MentorExtract) -> None:
    service, _, _ = build_fake_conversation_service(
        [AIMessage(content="Buy wonderful businesses.")]
    )
    written: list[str] = []

    used = await call_mentor(
        service,
        _mentors(mentor_extract),
        mentor_id=mentor_extract.id,
        query="What should I buy?",
        conversation_id="c1",
        write=written.append,
    )

    assert used == "c1"
    assert "".join(written) == "Buy wonderful businesses.\n"


async def test_call_rejects_an_unknown_mentor(mentor_extract: MentorExtract) -> None:
    service, _, _ = build_fake_conversation_service([])
    with pytest.raises(MentorNotFoundError):
        await call_mentor(
            service,
            _mentors(mentor_extract),
            mentor_id="nobody",
            query="Hi",
            conversation_id="c1",
            write=lambda _: None,
        )


# --- The command itself, through Typer -------------------------------------------


@pytest.fixture
def cli_services(monkeypatch: pytest.MonkeyPatch, mentor_extract: MentorExtract) -> list[str]:
    """Wire `mentor-agent call` to the fakes; returns the replies it will give, in order."""
    import mentor_agent.bootstrap
    import mentor_agent.db.client
    import mentor_agent.services.mentors

    replies = ["First answer.", "Second answer."]
    service, _, _ = build_fake_conversation_service([AIMessage(content=r) for r in replies])

    async def no_clients() -> None:
        return None

    def mentor_service(_repository: object) -> MentorService:
        return _mentors(mentor_extract)

    def no_repository(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(mentor_agent.bootstrap, "build_conversation_service", lambda: service)
    monkeypatch.setattr(mentor_agent.services.mentors, "MentorService", mentor_service)
    monkeypatch.setattr(mentor_agent.db.client, "AsyncMongoRepository", no_repository)
    monkeypatch.setattr(mentor_agent.db.client, "close_mongo_clients", no_clients)
    return replies


def test_call_command_prints_the_reply_and_the_conversation_id(
    cli_services: list[str], mentor_extract: MentorExtract
) -> None:
    result = CliRunner().invoke(app, ["call", "--mentor-id", mentor_extract.id, "--query", "Hello"])

    assert result.exit_code == 0, result.output
    # The reply is on stdout (pipeable); the id hint on stderr.
    assert result.stdout.strip() == cli_services[0]
    match = re.search(r"conversation id: ([0-9a-f]{32})", result.stderr)
    assert match, result.stderr


def test_call_command_continues_a_given_conversation(
    cli_services: list[str], mentor_extract: MentorExtract
) -> None:
    runner = CliRunner()
    args = ["call", "--mentor-id", mentor_extract.id, "--conversation-id", "c42"]

    runner.invoke(app, [*args, "--query", "Hello"])
    second = runner.invoke(app, [*args, "--query", "And then?"])

    assert second.exit_code == 0, second.output
    assert second.stdout.strip() == cli_services[1]
    assert "conversation id: c42" in second.stderr


def test_call_command_reports_an_unknown_mentor_without_a_traceback(
    cli_services: list[str],
) -> None:
    result = CliRunner().invoke(app, ["call", "--mentor-id", "nobody", "--query", "Hi"])

    assert result.exit_code == 1
    assert "error: Mentor for id nobody not found." in result.stderr
    assert "Traceback" not in result.output
    assert result.stdout == ""


def test_call_command_explains_a_missing_api_key(
    monkeypatch: pytest.MonkeyPatch, cli_services: list[str], mentor_extract: MentorExtract
) -> None:
    import mentor_agent.bootstrap
    from mentor_agent.config.base import MissingSettingError

    def no_key() -> None:
        msg = "OPENROUTER_API_KEY is empty: set it in .env"
        raise MissingSettingError(msg)

    monkeypatch.setattr(mentor_agent.bootstrap, "build_conversation_service", no_key)
    result = CliRunner().invoke(app, ["call", "--mentor-id", mentor_extract.id, "--query", "Hi"])

    assert result.exit_code == 1
    assert "error: OPENROUTER_API_KEY is empty" in result.stderr
    assert "Traceback" not in result.output
