from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from mentor_agent.models.ledger import LedgerLine
from mentor_agent.schemas.v1.chat import ChatRequest, OpenerRequest, parse_client_message
from mentor_agent.services.ledger import should_open

T0 = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)


def _line(mentor_id: str, minutes: int) -> LedgerLine:
    return LedgerLine(
        mentor_id=mentor_id,
        mentor_name=mentor_id.title(),
        conversation_id="c",
        topic="t",
        advice="a",
        created_at=T0 + timedelta(minutes=minutes),
    )


def test_a_plain_message_is_a_chat_request() -> None:
    parsed = parse_client_message({"mentor_id": "ada", "message": "Hi"})
    assert isinstance(parsed, ChatRequest)


def test_an_opener_needs_no_message() -> None:
    parsed = parse_client_message({"mentor_id": "ada", "opener": True, "conversation_id": "c1"})
    assert parsed == OpenerRequest(mentor_id="ada", opener=True, conversation_id="c1")


def test_an_opener_with_a_message_is_refused() -> None:
    with pytest.raises(ValidationError):
        parse_client_message({"mentor_id": "ada", "opener": True, "message": "Hi"})


def test_nothing_from_the_others_means_nothing_to_say() -> None:
    assert not should_open("buffett", [_line("buffett", 5)], None)


def test_newer_advice_from_another_mentor_is_worth_opening_with() -> None:
    assert should_open("buffett", [_line("munger", 5), _line("buffett", 1)], None)


def test_advice_older_than_the_mentor_own_last_word_is_old_news() -> None:
    assert not should_open("buffett", [_line("buffett", 9), _line("munger", 5)], None)


def test_advice_already_reacted_to_is_not_repeated() -> None:
    assert not should_open("buffett", [_line("munger", 5)], T0 + timedelta(minutes=6))
    assert should_open(
        "buffett", [_line("munger", 7), _line("munger", 5)], T0 + timedelta(minutes=6)
    )
