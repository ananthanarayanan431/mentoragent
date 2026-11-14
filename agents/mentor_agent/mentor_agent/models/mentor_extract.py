from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field, TypeAdapter

from mentor_agent.models.mentor import Mentor

if TYPE_CHECKING:
    from pathlib import Path


#: Long-term memory of a mentor added or rebuilt through the API. ``None``: built
#: offline (``mentor-agent create-memory``) or never built, so not tracked.
MemoryStatus = Literal["building", "ready", "failed"]


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
    image_url: str | None = Field(default=None, description="Image URL of the mentor")
    twitter_handle: str | None = Field(
        default=None, description="X/Twitter handle of the mentor, without the @"
    )
    pdfs: list[str] = Field(
        default_factory=list, description="PDF URLs with information about the mentor"
    )
    websites: list[str] = Field(
        default_factory=list, description="Websites with information about the mentor"
    )
    youtube_videos: list[str] = Field(
        default_factory=list, description="YouTube videos with information about the mentor"
    )
    search_wikipedia: bool = Field(
        default=True,
        description="Also read Wikipedia pages matching the name; off for people "
        "who are not on Wikipedia, so a namesake's pages do not leak in",
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Text pasted in by hand (LinkedIn posts, newsletters, transcripts)",
    )
    memory: MemoryStatus | None = Field(
        default=None, description="Long-term memory build status, when built through the API"
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
