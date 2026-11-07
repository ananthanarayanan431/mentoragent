"""The mentor pool: well-known figures the square can add at random.

Pure functions over plain data, so the choice is easy to test; the service
persists what they pick.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from mentor_agent.errors import PoolExhaustedError
from mentor_agent.models.mentor_extract import MentorExtract

if TYPE_CHECKING:
    import random
    from collections.abc import Collection, Sequence
    from pathlib import Path


def load_pool(path: Path) -> list[MentorExtract]:
    """The pool file (same shape as the extraction metadata file)."""
    return MentorExtract.from_json(path)


def remaining(pool: Sequence[MentorExtract], existing_ids: Collection[str]) -> list[MentorExtract]:
    """Pool mentors not yet in the square."""
    return [mentor for mentor in pool if mentor.id not in existing_ids]


def pick_new_mentor(
    pool: Sequence[MentorExtract], existing_ids: Collection[str], rng: random.Random
) -> MentorExtract:
    """A random pool mentor who is not in the square yet, with memory marked building.

    Raises:
        PoolExhaustedError: If every pool mentor is already in the square.
    """
    candidates = remaining(pool, existing_ids)
    if not candidates:
        raise PoolExhaustedError
    return rng.choice(candidates).model_copy(update={"memory": "building"})
