from __future__ import annotations

from fastapi import APIRouter

from mentoragent.api.dependencies import MentorServiceDep
from mentoragent.api.schemas import MentorOut

router = APIRouter(prefix="/mentors", tags=["mentors"])


@router.get("")
async def list_mentors(mentors: MentorServiceDep) -> list[MentorOut]:
    """List every available mentor."""
    return [MentorOut.from_extract(m) for m in await mentors.list_mentors()]


@router.get("/{mentor_id}")
async def get_mentor(mentor_id: str, mentors: MentorServiceDep) -> MentorOut:
    """Return one mentor."""
    return MentorOut.from_extract(await mentors.get_mentor(mentor_id))
