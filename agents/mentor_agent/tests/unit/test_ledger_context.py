from __future__ import annotations

from datetime import UTC, datetime, timedelta

from mentor_agent.models.ledger import LedgerLine
from mentor_agent.services.ledger import ledger_context

START = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)


def _line(n: int, mentor_id: str, name: str) -> LedgerLine:
    return LedgerLine(
        mentor_id=mentor_id,
        mentor_name=name,
        conversation_id="c",
        topic=f"topic {n}",
        advice=f"advice {n}.",
        created_at=START + timedelta(minutes=n),
    )


def test_the_goal_comes_first_then_what_the_others_advised() -> None:
    lines = [_line(2, "munger", "Charlie Munger"), _line(1, "dalio", "Ray Dalio")]
    assert ledger_context("Retire by 45", lines, "buffett") == (
        "The user's goal: Retire by 45\n"
        "Charlie Munger advised, on topic 2: advice 2.\n"
        "Ray Dalio advised, on topic 1: advice 1."
    )


def test_a_mentor_does_not_read_their_own_advice_back() -> None:
    lines = [_line(2, "buffett", "Warren Buffett"), _line(1, "munger", "Charlie Munger")]
    assert ledger_context(None, lines, "buffett") == "Charlie Munger advised, on topic 1: advice 1."


def test_only_the_newest_lines_are_kept() -> None:
    lines = [_line(n, "munger", "Charlie Munger") for n in range(20, 0, -1)]
    context = ledger_context(None, lines, "buffett", limit=3)
    assert context.splitlines() == [
        "Charlie Munger advised, on topic 20: advice 20.",
        "Charlie Munger advised, on topic 19: advice 19.",
        "Charlie Munger advised, on topic 18: advice 18.",
    ]


def test_nothing_known_is_an_empty_context() -> None:
    assert ledger_context(None, [], "buffett") == ""
