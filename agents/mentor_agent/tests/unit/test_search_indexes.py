from __future__ import annotations

from typing import Any

import pytest

from mentor_agent.db.indexes import vector_index_matches

# The shape Atlas returns in ``latestDefinition`` for our vector index.
CURRENT: dict[str, Any] = {
    "fields": [
        {"type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "dotProduct"},
        {"type": "filter", "path": "mentor_id"},
    ]
}


def test_an_index_with_the_same_size_and_filters_needs_no_update() -> None:
    assert vector_index_matches(CURRENT, 1536, ("mentor_id",))


@pytest.mark.parametrize(
    ("dim", "filters"),
    [
        (3072, ("mentor_id",)),  # a different embedding model
        (1536, ("mentor_id", "source")),  # a new filter
        (1536, ()),  # a filter removed
    ],
)
def test_a_changed_size_or_filter_needs_an_update(dim: int, filters: tuple[str, ...]) -> None:
    assert not vector_index_matches(CURRENT, dim, filters)


def test_an_empty_definition_needs_an_update() -> None:
    assert not vector_index_matches({}, 1536, ("mentor_id",))
