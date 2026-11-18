"""MongoDB hands datetimes back without a timezone; the models read them as UTC."""

from __future__ import annotations

from datetime import UTC, datetime

from mentor_agent.models.ledger import LedgerLine
from mentor_agent.models.profile import Profile

NAIVE = datetime(2026, 11, 15, 10, 25, 12)  # as pymongo returns it


def test_a_stored_ledger_time_is_read_as_utc() -> None:
    line = LedgerLine(
        mentor_id="m", mentor_name="M", conversation_id="c", topic="t", advice="a", created_at=NAIVE
    )
    assert line.created_at == NAIVE.replace(tzinfo=UTC)


def test_stored_profile_times_are_read_as_utc() -> None:
    profile = Profile(updated_at=NAIVE, heard_until={"m": NAIVE})  # read once, to migrate
    assert profile.updated_at == NAIVE.replace(tzinfo=UTC)
    assert profile.heard_until["m"] == NAIVE.replace(tzinfo=UTC)
