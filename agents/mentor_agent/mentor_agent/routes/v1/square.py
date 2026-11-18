"""Squares, and what is shared inside one: its goal, the advice ledger and ambient chats.

Every route here except ``/squares`` is about the square named by the ``X-Square-Id``
header (the first square when it is left out).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from mentor_agent.core.dependencies import (
    AdviceLedgerDep,
    AmbientChatsDep,
    AmbientStoreDep,
    CurrentSquareDep,
    SquareServiceDep,
    require_api_key_in_production,
)
from mentor_agent.core.errors import LedgerLineNotFoundError
from mentor_agent.schemas.v1.square import (
    AmbientChatOut,
    AmbientIn,
    GoalIn,
    GoalOut,
    LedgerLineOut,
    SquareIn,
    SquareOut,
    SquareUpdate,
)

router = APIRouter(tags=["square"])


@router.get("/squares")
async def list_squares(squares: SquareServiceDep) -> list[SquareOut]:
    """Every square, oldest first."""
    return [SquareOut.from_square(square) for square in await squares.list_squares()]


@router.post(
    "/squares",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key_in_production)],
)
async def create_square(body: SquareIn, squares: SquareServiceDep) -> SquareOut:
    """Make a new, empty square. Bring mentors in with ``PUT /mentors/{id}/square``."""
    return SquareOut.from_square(await squares.create(body.name, body.goal))


@router.get("/squares/{square_id}")
async def get_square(square_id: str, squares: SquareServiceDep) -> SquareOut:
    """One square (404 if there is none with this id)."""
    return SquareOut.from_square(await squares.get(square_id))


@router.patch("/squares/{square_id}", dependencies=[Depends(require_api_key_in_production)])
async def update_square(square_id: str, body: SquareUpdate, squares: SquareServiceDep) -> SquareOut:
    """Rename a square or change its goal."""
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    return SquareOut.from_square(await squares.update(square_id, changes))


@router.delete(
    "/squares/{square_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key_in_production)],
)
async def delete_square(
    square_id: str,
    squares: SquareServiceDep,
    ledger: AdviceLedgerDep,
    ambient_store: AmbientStoreDep,
) -> None:
    """Delete a square with its goal, advice and ambient chats. The mentors stay in your
    mentors and in their other squares. 409 for your only square."""
    await squares.delete(square_id, [ledger, ambient_store])


@router.get("/goal")
async def get_goal(square: CurrentSquareDep) -> GoalOut:
    """The goal every mentor in the square knows about."""
    return GoalOut(goal=square.goal)


@router.put("/goal", dependencies=[Depends(require_api_key_in_production)])
async def set_goal(body: GoalIn, square: CurrentSquareDep, squares: SquareServiceDep) -> GoalOut:
    """Set or change the square's goal."""
    return GoalOut(goal=(await squares.set_goal(square.id, body.goal)).goal)


@router.get("/ledger")
async def list_ledger(
    square: CurrentSquareDep,
    ledger: AdviceLedgerDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[LedgerLineOut]:
    """What the square's mentors have told the user, newest first."""
    lines = await ledger.recent(square.id, limit)
    return [LedgerLineOut.model_validate(line.model_dump()) for line in lines]


@router.delete(
    "/ledger/{line_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key_in_production)],
)
async def delete_ledger_line(
    line_id: str, square: CurrentSquareDep, ledger: AdviceLedgerDep
) -> None:
    """Forget a piece of advice, so no mentor in the square reads it again."""
    if not await ledger.delete(square.id, line_id):
        raise LedgerLineNotFoundError


@router.post(
    "/ambient",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key_in_production)],
)
async def start_ambient_chat(
    body: AmbientIn, square: CurrentSquareDep, ambient: AmbientChatsDep
) -> AmbientChatOut:
    """Two of the square's mentors chat about its goal (the browser asks while the square
    is open).

    409 when a mentor is not ready; 429 when the last chat in this square was too
    recent; 502 when the model fails.
    """
    chat = await ambient.start(square.id, body.mentor_ids[0], body.mentor_ids[1])
    return AmbientChatOut.model_validate(chat.model_dump())
