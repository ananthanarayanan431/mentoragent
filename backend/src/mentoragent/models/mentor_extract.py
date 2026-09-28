from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, Field, TypeAdapter

from mentoragent.models.mentor import Mentor

if TYPE_CHECKING:
    from pathlib import Path


class MentorExtract(BaseModel):
    """Raw mentor data, as listed in the extraction metadata file.

    Holds the mentor's identity plus the sources to extract knowledge from,
    before any enrichment.
    """

    id: str = Field(description="Unique identifier for the mentor")
    name: str = Field(description="Name of the mentor")
    expertise: str = Field(description="Expertise of the mentor")
    perspective: str = Field(description="Perspective of the mentor")
    style: str = Field(description="Style of the mentor")
    image_url: str = Field(description="Image URL of the mentor")
    twitter_handle: str = Field(description="Twitter handle of the mentor")
    pdfs: list[str] = Field(
        default_factory=list, description="PDF URLs with information about the mentor"
    )
    websites: list[str] = Field(
        default_factory=list, description="Websites with information about the mentor"
    )
    youtube_videos: list[str] = Field(
        default_factory=list, description="YouTube videos with information about the mentor"
    )

    @classmethod
    def from_json(cls, metadata_file: Path) -> list[MentorExtract]:
        """Load and validate every mentor listed in a JSON file."""
        return _MENTOR_LIST.validate_json(metadata_file.read_bytes())

    def to_mentor(self) -> Mentor:
        """Project onto the :class:`Mentor` persona used by the workflow."""
        return Mentor(
            id=self.id,
            mentor_name=self.name,
            mentor_expertise=self.expertise,
            mentor_perspective=self.perspective,
            mentor_style=self.style,
        )


_MENTOR_LIST = TypeAdapter(list[MentorExtract])
