from __future__ import annotations

import random
from typing import TYPE_CHECKING

from fastapi import APIRouter, BackgroundTasks, Depends, status

from mentor_agent.core.dependencies import (
    CurrentSquareDep,
    EnricherDep,
    MemoryBuilderDep,
    MentorPoolDep,
    MentorPresetsDep,
    MentorServiceDep,
    SquareServiceDep,
    require_api_key_in_production,
)
from mentor_agent.schemas.v1.mentors import (
    MentorCreate,
    MentorOut,
    MentorSources,
    MentorUpdate,
    PoolOut,
    PresetOut,
)
from mentor_agent.services.enrich import PERSONA_FIELDS, PersonaField
from mentor_agent.services.persona import fallback_persona
from mentor_agent.services.pool import remaining

if TYPE_CHECKING:
    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.models.square import Square

router = APIRouter(prefix="/mentors", tags=["mentors"])

# Picking a mentor is not security-sensitive, so a plain PRNG is right here.
_rng = random.Random()  # noqa: S311 - not used for anything secret


def _out(mentor: MentorExtract, square: Square) -> MentorOut:
    """The mentor as seen from one square."""
    return MentorOut.from_extract(mentor, in_square=mentor.id in square.mentor_ids)


@router.get("")
async def list_mentors(mentors: MentorServiceDep, square: CurrentSquareDep) -> list[MentorOut]:
    """List every mentor; ``in_square`` says who walks around the current square."""
    return [_out(m, square) for m in await mentors.list_mentors()]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key_in_production)],
)
async def create_mentor(
    body: MentorCreate,
    mentors: MentorServiceDep,
    enricher: EnricherDep,
    square: CurrentSquareDep,
    background: BackgroundTasks,
) -> MentorOut:
    """Add a mentor you describe: a name plus videos, web pages, PDFs or pasted text.

    Returns at once, with memory ``building`` and a placeholder for any persona
    field left out. In the background the mentor is researched on the web (unless
    ``research`` is false), the persona and sources are completed, and the memory
    is built; poll the mentor until its memory is ``ready``. Chat is refused (409)
    until then. The mentor starts outside every square: bring them in with
    ``PUT /mentors/{id}/square``.
    """
    fields = body.model_dump(exclude={"research"})
    write: list[PersonaField] = [field for field in PERSONA_FIELDS if fields[field] is None]
    placeholder = fallback_persona(body.name)
    for field in write:
        fields[field] = getattr(placeholder, field)
    mentor = await mentors.add_custom(fields)
    background.add_task(enricher.enrich, mentor.id, research=body.research, write=write)
    return _out(mentor, square)


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
    square: CurrentSquareDep,
    squares: SquareServiceDep,
    background: BackgroundTasks,
) -> MentorOut:
    """Add a random mentor from the pool to the current square, and build their memory
    in the background.

    The mentor can be talked to once their memory status leaves ``building``.
    409 when every pool mentor is already here.
    """
    mentor = await mentors.add_from_pool(pool, _rng)
    joined = await squares.add_mentor(square.id, mentor.id)
    background.add_task(memory.rebuild, mentor.id)
    return _out(mentor, joined)


@router.get("/presets")
async def mentor_presets(mentors: MentorServiceDep, presets: MentorPresetsDep) -> list[PresetOut]:
    """Famous mentors offered by name, with background notes stored ahead of time."""
    here = await mentors.ids()
    return [
        PresetOut(
            id=p.id,
            name=p.name,
            expertise=p.expertise,
            perspective=p.perspective,
            style=p.style,
            category=p.category,
            added=p.id in here,
        )
        for p in presets
    ]


@router.post(
    "/presets/{preset_id}",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key_in_production)],
)
async def add_preset_mentor(
    preset_id: str,
    mentors: MentorServiceDep,
    presets: MentorPresetsDep,
    memory: MemoryBuilderDep,
    square: CurrentSquareDep,
    background: BackgroundTasks,
) -> MentorOut:
    """Create a preset mentor and build their memory in the background from their stored
    notes and Wikipedia; no web research. They start outside every square: bring them in
    with ``PUT /mentors/{id}/square``. 404 for an unknown preset, 409 if already created.
    """
    mentor = await mentors.add_preset(presets, preset_id)
    background.add_task(memory.rebuild, mentor.id)
    return _out(mentor, square)


@router.get("/{mentor_id}")
async def get_mentor(
    mentor_id: str, mentors: MentorServiceDep, square: CurrentSquareDep
) -> MentorOut:
    """Return one mentor."""
    return _out(await mentors.get_mentor(mentor_id), square)


@router.put("/{mentor_id}/square", dependencies=[Depends(require_api_key_in_production)])
async def bring_into_square(
    mentor_id: str, mentors: MentorServiceDep, square: CurrentSquareDep, squares: SquareServiceDep
) -> MentorOut:
    """Bring a mentor into the current square."""
    mentor = await mentors.get_mentor(mentor_id)
    return _out(mentor, await squares.add_mentor(square.id, mentor.id))


@router.delete("/{mentor_id}/square", dependencies=[Depends(require_api_key_in_production)])
async def send_out_of_square(
    mentor_id: str, mentors: MentorServiceDep, square: CurrentSquareDep, squares: SquareServiceDep
) -> MentorOut:
    """Send a mentor out of the current square. They stay in your mentors, with their
    memory, and what they said in this square is kept for when they come back."""
    mentor = await mentors.get_mentor(mentor_id)
    return _out(mentor, await squares.remove_mentor(square.id, mentor.id))


@router.get("/{mentor_id}/sources")
async def get_mentor_sources(mentor_id: str, mentors: MentorServiceDep) -> MentorSources:
    """Where the mentor's long-term memory is built from."""
    return MentorSources.from_extract(await mentors.get_mentor(mentor_id))


@router.patch("/{mentor_id}", dependencies=[Depends(require_api_key_in_production)])
async def update_mentor(
    mentor_id: str, changes: MentorUpdate, mentors: MentorServiceDep, square: CurrentSquareDep
) -> MentorOut:
    """Change a mentor's persona or sources. Rebuild the memory to use new sources."""
    updated = await mentors.update_mentor(mentor_id, changes.model_dump(exclude_unset=True))
    return _out(updated, square)


@router.delete(
    "/{mentor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key_in_production)],
)
async def remove_mentor(
    mentor_id: str, mentors: MentorServiceDep, memory: MemoryBuilderDep, squares: SquareServiceDep
) -> None:
    """Remove a mentor from every square, with their long-term memory. Pool mentors can
    be added again.

    409 while their memory is being built.
    """
    await mentors.remove_mentor(mentor_id)
    await squares.forget_mentor(mentor_id)
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
    square: CurrentSquareDep,
    background: BackgroundTasks,
) -> MentorOut:
    """Rebuild the mentor's long-term memory in the background (409 if already running)."""
    mentor = await mentors.start_memory_build(mentor_id)
    background.add_task(memory.rebuild, mentor.id)
    return _out(mentor, square)
