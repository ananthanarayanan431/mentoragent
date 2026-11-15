from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from mentor_agent.core.errors import AmbientNotEligibleError
from mentor_agent.models.ledger import LedgerLine
from mentor_agent.models.mentor_extract import MentorExtract
from mentor_agent.services.ambient import (
    AmbientScript,
    AmbientScriptLine,
    check_eligible,
    lines_for,
    too_soon,
)

NOW = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)


def _mentor(mentor_id: str, memory: str | None = "ready") -> MentorExtract:
    return MentorExtract.model_validate(
        {
            "id": mentor_id,
            "name": mentor_id,
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


def test_two_ready_mentors_who_both_advised_you_can_chat() -> None:
    check_eligible(_mentor("a"), _mentor("b"), [_line("a"), _line("b")])


def test_a_mentor_who_never_advised_you_has_nothing_to_chat_about() -> None:
    with pytest.raises(AmbientNotEligibleError, match="b has not advised you yet"):
        check_eligible(_mentor("a"), _mentor("b"), [_line("a")])


def test_a_mentor_whose_memory_builds_cannot_chat() -> None:
    with pytest.raises(AmbientNotEligibleError, match="still reading up"):
        check_eligible(_mentor("a"), _mentor("b", "building"), [_line("a"), _line("b")])


def test_the_floor_between_two_chats() -> None:
    assert too_soon(NOW - timedelta(seconds=100), NOW, 180)
    assert not too_soon(NOW - timedelta(seconds=180), NOW, 180)
    assert not too_soon(None, NOW, 180)


def test_speakers_a_and_b_become_the_two_mentors() -> None:
    script = AmbientScript(
        lines=[
            AmbientScriptLine(speaker="a", text="Hi Ray."),
            AmbientScriptLine(speaker="b", text="Hi."),
        ]
    )
    assert [(line.mentor_id, line.text) for line in lines_for(script, "buffett", "dalio")] == [
        ("buffett", "Hi Ray."),
        ("dalio", "Hi."),
    ]


@pytest.mark.parametrize("count", [1, 5])
def test_a_chat_has_two_to_four_lines(count: int) -> None:
    with pytest.raises(ValidationError):
        AmbientScript(lines=[AmbientScriptLine(speaker="a", text="x")] * count)
