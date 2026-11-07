from __future__ import annotations

import random

from fastapi import APIRouter, BackgroundTasks, Depends, status

from mentor_agent.dependencies import (
    MemoryBuilderDep,
    MentorPoolDep,
    MentorServiceDep,
    require_api_key_in_production,
)
from mentor_agent.schemas.v1.mentors import MentorOut, MentorSources, MentorUpdate, PoolOut
from mentor_agent.services.pool import remaining

router = APIRouter(prefix="/mentors", tags=["mentors"])

# Picking a mentor is not security-sensitive, so a plain PRNG is right here.
_rng = random.Random()  # noqa: S311 - not used for anything secret


@router.get("")
async def list_mentors(mentors: MentorServiceDep) -> list[MentorOut]:
    """List every available mentor."""
    return [MentorOut.from_extract(m) for m in await mentors.list_mentors()]


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
