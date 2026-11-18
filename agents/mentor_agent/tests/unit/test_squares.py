"""Moving data from before squares existed into the first square, and keeping each
square's conversations apart."""

from __future__ import annotations

from datetime import UTC, datetime

from mentor_agent.services.conversation import in_square
from mentor_agent.services.squares import first_square

AT = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)


def test_the_first_square_takes_the_old_goal_and_who_was_in_the_square() -> None:
    square = first_square(
        "Retire by 45",
        AT,
        {"munger": AT},
        [
            {"id": "munger", "in_square": True},
            {"id": "buffett"},  # stored before in_square existed: in the square
            {"id": "tendulkar", "in_square": False},
            {"_id": "no id"},
        ],
    )
    assert (square.id, square.name) == ("main", "My square")
    assert (square.goal, square.goal_updated_at) == ("Retire by 45", AT)
    assert square.mentor_ids == ["buffett", "munger"]
    assert square.heard_until == {"munger": AT}


def test_with_no_old_profile_the_first_square_starts_empty() -> None:
    square = first_square(None, None, {}, [])
    assert (square.goal, square.mentor_ids, square.heard_until) == (None, [], {})


def test_the_first_square_keeps_its_old_conversations() -> None:
    assert in_square("main", "c1") == "c1"


def test_other_squares_never_share_a_conversation_id() -> None:
    assert in_square("cricket", "c1") == "cricket.c1"
    assert in_square("cricket", "c1") != in_square("chess", "c1")
