"""Preset mentors: famous figures offered by name, with background notes stored
ahead of time so they need no web research before their memory is built.

Pure functions over plain data, so the rules are easy to test; the service
persists what they return.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import Field, TypeAdapter

from mentor_agent.core.errors import PresetAlreadyAddedError, PresetNotFoundError
from mentor_agent.models.mentor_extract import MentorExtract

if TYPE_CHECKING:
    from collections.abc import Collection, Sequence
    from pathlib import Path


class PresetMentor(MentorExtract):
    """A mentor ready to add, plus the group the picker shows them in."""

    category: str = Field(description="Group shown in the picker, e.g. Science or Cricket")

    def to_extract(self) -> MentorExtract:
        """The mentor as stored: no category, memory building, and outside the square
        until you bring them in."""
        fields = self.model_dump(exclude={"category"})
        return MentorExtract.model_validate({**fields, "memory": "building", "in_square": False})


_PRESET_LIST = TypeAdapter(list[PresetMentor])


def load_presets(path: Path) -> list[PresetMentor]:
    """Every preset listed in the presets file."""
    return _PRESET_LIST.validate_json(path.read_bytes())


def take_preset(
    presets: Sequence[PresetMentor], preset_id: str, existing_ids: Collection[str]
) -> MentorExtract:
    """The preset with this id, ready to insert into the square.

    Raises:
        PresetNotFoundError: If no preset has this id.
        PresetAlreadyAddedError: If they are already in the square.
    """
    preset = next((p for p in presets if p.id == preset_id), None)
    if preset is None:
        raise PresetNotFoundError
    if preset.id in existing_ids:
        raise PresetAlreadyAddedError
    return preset.to_extract()
