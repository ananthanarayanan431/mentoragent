"""Mentor bodies."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

if TYPE_CHECKING:
    from mentor_agent.models.mentor_extract import MentorExtract

PersonaText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]
# https only: the server fetches these when it rebuilds the mentor's memory.
SourceUrl = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^https://\S+$", max_length=2000)
]
# Pasted text such as a LinkedIn post; long enough for an essay or a transcript.
NoteText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000)]
Handle = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9_]{1,15}$")]


class MentorOut(BaseModel):
    """Public view of a mentor (sources are at ``/mentors/{id}/sources``)."""

    id: str
    name: str
    expertise: str
    perspective: str
    style: str
    image_url: str | None = None
    memory: Literal["building", "ready", "failed"] | None = Field(
        default=None,
        description="Memory build status for mentors added or rebuilt through the API.",
    )

    @classmethod
    def from_extract(cls, mentor: MentorExtract) -> MentorOut:
        return cls.model_validate(mentor.model_dump(include=set(cls.model_fields)))


class MentorSources(BaseModel):
    """Where a mentor's long-term memory comes from (Wikipedia is searched by name)."""

    twitter_handle: str | None = None
    pdfs: list[str] = Field(default_factory=list)
    websites: list[str] = Field(default_factory=list)
    youtube_videos: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    search_wikipedia: bool = True

    @classmethod
    def from_extract(cls, mentor: MentorExtract) -> MentorSources:
        return cls.model_validate(mentor.model_dump(include=set(cls.model_fields)))


class MentorUpdate(BaseModel):
    """Changes to a mentor; omitted fields stay as they are. Changing sources does
    not rebuild the memory by itself: call ``POST /mentors/{id}/memory`` after."""

    model_config = ConfigDict(extra="forbid")

    name: PersonaText | None = None
    expertise: PersonaText | None = None
    perspective: PersonaText | None = None
    style: PersonaText | None = None
    twitter_handle: Handle | None = None
    pdfs: Annotated[list[SourceUrl], Field(max_length=20)] | None = None
    websites: Annotated[list[SourceUrl], Field(max_length=20)] | None = None
    youtube_videos: Annotated[list[SourceUrl], Field(max_length=20)] | None = None
    notes: Annotated[list[NoteText], Field(max_length=20)] | None = None
    search_wikipedia: bool | None = None


class MentorCreate(BaseModel):
    """A mentor you describe yourself. Persona fields left out are written for you
    from the name and any pasted notes; the memory is built from the sources in the
    background, as for a random mentor."""

    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    expertise: PersonaText | None = None
    perspective: PersonaText | None = None
    style: PersonaText | None = None
    image_url: SourceUrl | None = None
    twitter_handle: Handle | None = None
    pdfs: Annotated[list[SourceUrl], Field(max_length=20)] = Field(default_factory=list)
    websites: Annotated[list[SourceUrl], Field(max_length=20)] = Field(default_factory=list)
    youtube_videos: Annotated[list[SourceUrl], Field(max_length=20)] = Field(default_factory=list)
    notes: Annotated[list[NoteText], Field(max_length=20)] = Field(default_factory=list)
    search_wikipedia: bool = Field(
        default=False,
        description="Also read Wikipedia pages matching the name (for well-known people).",
    )


class PoolOut(BaseModel):
    """How many pool mentors can still be added."""

    remaining: int
    total: int
