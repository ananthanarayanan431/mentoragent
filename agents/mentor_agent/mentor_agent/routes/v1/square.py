"""The square's shared state: the user's goal, the advice ledger and ambient chats."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from mentor_agent.core.dependencies import (
    AdviceLedgerDep,
    AmbientChatsDep,
    ProfileServiceDep,
    require_api_key_in_production,
)
from mentor_agent.core.errors import LedgerLineNotFoundError
from mentor_agent.schemas.v1.square import (
    AmbientChatOut,
    AmbientIn,
    GoalIn,
    GoalOut,
    LedgerLineOut,
)

router = APIRouter(tags=["square"])


@router.get("/goal")
async def get_goal(profile: ProfileServiceDep) -> GoalOut:
    """The goal every mentor knows about."""
    return GoalOut(goal=(await profile.get()).goal)


@router.put("/goal", dependencies=[Depends(require_api_key_in_production)])
async def set_goal(body: GoalIn, profile: ProfileServiceDep) -> GoalOut:
    """Set or change the goal."""
    return GoalOut(goal=(await profile.set_goal(body.goal)).goal)


@router.get("/ledger")
async def list_ledger(
    ledger: AdviceLedgerDep, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> list[LedgerLineOut]:
    """What the mentors have told the user, newest first."""
    return [LedgerLineOut.model_validate(line.model_dump()) for line in await ledger.recent(limit)]


@router.delete(
    "/ledger/{line_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key_in_production)],
)
async def delete_ledger_line(line_id: str, ledger: AdviceLedgerDep) -> None:
    """Forget a piece of advice, so no mentor reads it again."""
    if not await ledger.delete(line_id):
        raise LedgerLineNotFoundError


@router.post(
    "/ambient",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key_in_production)],
)
async def start_ambient_chat(body: AmbientIn, ambient: AmbientChatsDep) -> AmbientChatOut:
    """Two mentors chat about the user's goal (the browser asks while the square is open).

    409 when a mentor is not ready or never advised the user; 429 when the last chat
    was too recent; 502 when the model fails.
    """
    chat = await ambient.start(body.mentor_ids[0], body.mentor_ids[1])
    return AmbientChatOut.model_validate(chat.model_dump())
