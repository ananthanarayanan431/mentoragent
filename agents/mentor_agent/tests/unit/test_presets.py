from __future__ import annotations

import pytest

from mentor_agent.config import settings
from mentor_agent.core.errors import PresetAlreadyAddedError, PresetNotFoundError
from mentor_agent.services.presets import PresetMentor, load_presets, take_preset


def _preset(preset_id: str) -> PresetMentor:
    return PresetMentor(
        id=preset_id,
        name=preset_id.title(),
        expertise="e",
        perspective="p",
        style="s",
        category="Science",
        notes=["Some background."],
    )


def test_takes_a_preset_ready_to_build() -> None:
    mentor = take_preset([_preset("a"), _preset("b")], "b", {"a"})
    assert mentor.id == "b"
    assert mentor.memory == "building"
    assert mentor.in_square is False
    assert mentor.notes == ["Some background."]
    assert "category" not in mentor.model_dump()


def test_an_unknown_preset_is_not_found() -> None:
    with pytest.raises(PresetNotFoundError):
        take_preset([_preset("a")], "zz", set())


def test_a_preset_already_here_is_a_conflict() -> None:
    with pytest.raises(PresetAlreadyAddedError):
        take_preset([_preset("a")], "a", {"a"})


def test_the_shipped_presets_load_with_stored_context() -> None:
    presets = load_presets(settings.paths.MENTOR_PRESETS_FILE_PATH)
    names = {p.name for p in presets}
    assert {"Isaac Newton", "Albert Einstein", "Viv Richards", "Sachin Tendulkar"} <= names
    assert len({p.id for p in presets}) == len(presets)
    for preset in presets:
        # Pre-stored context: the memory never depends on a web search succeeding.
        assert len(preset.notes) >= 3, preset.id
        assert preset.category
