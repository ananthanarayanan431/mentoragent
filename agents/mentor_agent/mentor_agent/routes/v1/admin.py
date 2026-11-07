"""Administrative operations."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from mentor_agent.dependencies import require_api_key_in_production
from mentor_agent.schemas.v1.admin import ResetMemoryResponse
from mentor_agent.services.maintenance import reset_conversation_state

router = APIRouter(tags=["admin"])


@router.post("/reset-memory", dependencies=[Depends(require_api_key_in_production)])
async def reset_memory() -> ResetMemoryResponse:
    """Delete every conversation's short-term memory.

    In production this is only enabled when an ``API_KEY`` protects the API.
    """
    dropped = await run_in_threadpool(reset_conversation_state)
    return ResetMemoryResponse(dropped_collections=dropped)
