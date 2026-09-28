"""Administrative operations."""

from __future__ import annotations

from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from mentoragent.api.schemas import ResetMemoryResponse
from mentoragent.core.config import settings
from mentoragent.core.exceptions import PermissionException
from mentoragent.services.maintenance import reset_conversation_state

router = APIRouter(tags=["admin"])


@router.post("/reset-memory")
async def reset_memory() -> ResetMemoryResponse:
    """Delete every conversation's short-term memory.

    In production this is only enabled when an ``API_KEY`` protects the API.
    """
    if settings.app.is_production and settings.app.API_KEY is None:
        raise PermissionException("reset-memory requires API_KEY to be configured in production")
    dropped = await run_in_threadpool(reset_conversation_state)
    return ResetMemoryResponse(dropped_collections=dropped)
