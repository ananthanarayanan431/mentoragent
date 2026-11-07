from __future__ import annotations

import random

import pytest

from mentor_agent.config import settings
from mentor_agent.errors import PoolExhaustedError
from mentor_agent.models.mentor_extract import MentorExtract
from mentor_agent.services.pool import load_pool, pick_new_mentor, remaining


def _mentor(mentor_id: str) -> MentorExtract:
    return MentorExtract(
        id=mentor_id, name=mentor_id.title(), expertise="e", perspective="p", style="s"
    )


def test_picks_only_mentors_not_in_the_square() -> None:
    pool = [_mentor("a"), _mentor("b"), _mentor("c")]
    rng = random.Random(1)
    picks = {pick_new_mentor(pool, {"a", "b"}, rng).id for _ in range(20)}
    assert picks == {"c"}


def test_pick_is_random_across_the_remaining_pool() -> None:
    pool = [_mentor(str(i)) for i in range(10)]
    rng = random.Random(7)
    picks = {pick_new_mentor(pool, set(), rng).id for _ in range(100)}
    assert len(picks) > 5


def test_a_picked_mentor_starts_with_memory_building() -> None:
    picked = pick_new_mentor([_mentor("a")], set(), random.Random(0))
    assert picked.memory == "building"


def test_an_exhausted_pool_is_a_conflict() -> None:
    with pytest.raises(PoolExhaustedError) as caught:
        pick_new_mentor([_mentor("a")], {"a"}, random.Random(0))
    assert caught.value.status_code == 409


def test_the_shipped_pool_is_valid_and_distinct_from_the_seed_mentors() -> None:
    pool = load_pool(settings.paths.MENTOR_POOL_FILE_PATH)
    seed = MentorExtract.from_json(settings.paths.EXTRACTION_METADATA_FILE_PATH)
    assert len(pool) >= 10
    assert len({m.id for m in pool}) == len(pool)
    assert remaining(pool, {m.id for m in seed}) == pool
    for mentor in pool:
        assert mentor.name and mentor.expertise and mentor.perspective and mentor.style
