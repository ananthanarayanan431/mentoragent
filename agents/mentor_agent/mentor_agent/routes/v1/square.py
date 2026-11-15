"""The square's shared state: the user's goal."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from mentor_agent.core.dependencies import ProfileServiceDep, require_api_key_in_production
from mentor_agent.schemas.v1.square import GoalIn, GoalOut

router = APIRouter(tags=["square"])


@router.get("/goal")
async def get_goal(profile: ProfileServiceDep) -> GoalOut:
    """The goal every mentor knows about."""
    return GoalOut(goal=(await profile.get()).goal)


@router.put("/goal", dependencies=[Depends(require_api_key_in_production)])
async def set_goal(body: GoalIn, profile: ProfileServiceDep) -> GoalOut:
    """Set or change the goal."""
    return GoalOut(goal=(await profile.set_goal(body.goal)).goal)
