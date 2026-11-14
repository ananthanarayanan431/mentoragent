"""Turns a mentor the user described into a full one, in the background: web
research for persona and sources, then the memory build."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal, Protocol

from loguru import logger

from mentor_agent.services.research import LINK_LIMITS, new_links

if TYPE_CHECKING:
    from collections.abc import Collection

    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.memory import MemoryBuilder
    from mentor_agent.services.mentors import MentorService
    from mentor_agent.services.persona import PersonaWriter
    from mentor_agent.services.research import MentorResearcher, ResearchFindings

PersonaField = Literal["expertise", "perspective", "style"]
PERSONA_FIELDS: tuple[PersonaField, ...] = ("expertise", "perspective", "style")


class Enricher(Protocol):
    """Completes a custom mentor and builds their memory; never raises."""

    async def enrich(
        self, mentor_id: str, *, research: bool, write: Collection[PersonaField]
    ) -> None: ...


def research_changes(
    mentor: MentorExtract, findings: ResearchFindings, write: Collection[PersonaField]
) -> dict[str, Any]:
    """The mentor fields to change after research: the persona fields the user left
    blank, new source links, and the profile as a note. Pure, so it is easy to test."""
    changes: dict[str, Any] = {field: getattr(findings, field) for field in write}
    for field, limit in LINK_LIMITS.items():
        known: list[str] = getattr(mentor, field)
        found = new_links(getattr(findings, field), known, limit)
        if found:
            changes[field] = [*known, *found]
    profile = findings.profile.strip()
    if profile:
        note = f"Research profile of {mentor.name}, written from web sources:\n\n{profile}"
        changes["notes"] = [*mentor.notes, note]
    return changes


class MentorEnricher:
    """Researches a new custom mentor, applies what was found, then builds their memory.

    Args:
        mentors: Where the mentor is read and updated.
        researcher: Web research; returns ``None`` when it cannot run.
        personas: Writes the persona when research is off or fails.
        memory: Builds the memory once the mentor is complete.
    """

    def __init__(
        self,
        mentors: MentorService,
        researcher: MentorResearcher,
        personas: PersonaWriter,
        memory: MemoryBuilder,
    ) -> None:
        self.mentors = mentors
        self.researcher = researcher
        self.personas = personas
        self.memory = memory

    async def enrich(
        self, mentor_id: str, *, research: bool, write: Collection[PersonaField]
    ) -> None:
        try:
            mentor = await self.mentors.get_mentor(mentor_id)
            changes = await self._changes(mentor, research=research, write=write)
            if changes:
                await self.mentors.update_mentor(mentor_id, changes)
        except Exception:  # noqa: BLE001 - a background job: the memory still gets built
            logger.exception("Could not complete custom mentor {}", mentor_id)
        await self.memory.rebuild(mentor_id)

    async def _changes(
        self, mentor: MentorExtract, *, research: bool, write: Collection[PersonaField]
    ) -> dict[str, Any]:
        if research:
            findings = await self.researcher.research(mentor)
            if findings is not None:
                return research_changes(mentor, findings, write)
        if not write:
            return {}
        persona = await self.personas.write(mentor.name, mentor.notes)
        return {field: getattr(persona, field) for field in write}
