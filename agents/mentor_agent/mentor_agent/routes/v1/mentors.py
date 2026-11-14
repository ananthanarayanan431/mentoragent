from __future__ import annotations

import random

from fastapi import APIRouter, BackgroundTasks, Depends, status

from mentor_agent.dependencies import (
    EnricherDep,
    MemoryBuilderDep,
    MentorPoolDep,
    MentorServiceDep,
    require_api_key_in_production,
)
from mentor_agent.schemas.v1.mentors import (
    MentorCreate,
    MentorOut,
    MentorSources,
    MentorUpdate,
    PoolOut,
)
from mentor_agent.services.enrich import PERSONA_FIELDS, PersonaField
from mentor_agent.services.persona import fallback_persona
from mentor_agent.services.pool import remaining

router = APIRouter(prefix="/mentors", tags=["mentors"])

# Picking a mentor is not security-sensitive, so a plain PRNG is right here.
_rng = random.Random()  # noqa: S311 - not used for anything secret


@router.get("")
async def list_mentors(mentors: MentorServiceDep) -> list[MentorOut]:
    """List every available mentor."""
    return [MentorOut.from_extract(m) for m in await mentors.list_mentors()]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key_in_production)],
)
async def create_mentor(
    body: MentorCreate,
    mentors: MentorServiceDep,
    enricher: EnricherDep,
    background: BackgroundTasks,
) -> MentorOut:
    """Add a mentor you describe: a name plus videos, web pages, PDFs or pasted text.

    Returns at once, with memory ``building`` and a placeholder for any persona
    field left out. In the background the mentor is researched on the web (unless
    ``research`` is false), the persona and sources are completed, and the memory
    is built; poll the mentor until its memory is ``ready``.
    """
    fields = body.model_dump(exclude={"research"})
    write: list[PersonaField] = [field for field in PERSONA_FIELDS if fields[field] is None]
    placeholder = fallback_persona(body.name)
    for field in write:
        fields[field] = getattr(placeholder, field)
    mentor = await mentors.add_custom(fields)
    background.add_task(enricher.enrich, mentor.id, research=body.research, write=write)
    return MentorOut.from_extract(mentor)


@router.get("/pool")
async def mentor_pool(mentors: MentorServiceDep, pool: MentorPoolDep) -> PoolOut:
    """How many mentors "Add a mentor" can still bring into the square."""
    return PoolOut(remaining=len(remaining(pool, await mentors.ids())), total=len(pool))


@router.post(
    "/random",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key_in_production)],
)
async def add_random_mentor(
    mentors: MentorServiceDep,
    pool: MentorPoolDep,
    memory: MemoryBuilderDep,
    background: BackgroundTasks,
) -> MentorOut:
    """Add a random mentor from the pool, and build their memory in the background.

    The mentor can be talked to at once; answers draw on their memory once its
    status turns ``ready``. 409 when every pool mentor is already here.
    """
    mentor = await mentors.add_from_pool(pool, _rng)
    background.add_task(memory.rebuild, mentor.id)
    return MentorOut.from_extract(mentor)


@router.get("/{mentor_id}")
async def get_mentor(mentor_id: str, mentors: MentorServiceDep) -> MentorOut:
    """Return one mentor."""
    return MentorOut.from_extract(await mentors.get_mentor(mentor_id))


@router.get("/{mentor_id}/sources")
async def get_mentor_sources(mentor_id: str, mentors: MentorServiceDep) -> MentorSources:
    """Where the mentor's long-term memory is built from."""
    return MentorSources.from_extract(await mentors.get_mentor(mentor_id))


@router.patch("/{mentor_id}", dependencies=[Depends(require_api_key_in_production)])
async def update_mentor(
    mentor_id: str, changes: MentorUpdate, mentors: MentorServiceDep
) -> MentorOut:
    """Change a mentor's persona or sources. Rebuild the memory to use new sources."""
    updated = await mentors.update_mentor(mentor_id, changes.model_dump(exclude_unset=True))
    return MentorOut.from_extract(updated)


@router.delete(
    "/{mentor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key_in_production)],
)
async def remove_mentor(
    mentor_id: str, mentors: MentorServiceDep, memory: MemoryBuilderDep
) -> None:
    """Remove a mentor and their long-term memory. Pool mentors can be added again.

    409 while their memory is being built.
    """
    await mentors.remove_mentor(mentor_id)
    await memory.forget(mentor_id)


@router.post(
    "/{mentor_id}/memory",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_api_key_in_production)],
)
async def rebuild_mentor_memory(
    mentor_id: str,
    mentors: MentorServiceDep,
    memory: MemoryBuilderDep,
    background: BackgroundTasks,
) -> MentorOut:
    """Rebuild the mentor's long-term memory in the background (409 if already running)."""
    mentor = await mentors.start_memory_build(mentor_id)
    background.add_task(memory.rebuild, mentor.id)
    return MentorOut.from_extract(mentor)
