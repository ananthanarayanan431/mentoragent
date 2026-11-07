"""Liveness and readiness probes (unauthenticated, outside /api/v1)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from loguru import logger

from mentor_agent.db.client import get_async_mongo_client
from mentor_agent.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> HealthResponse:
    """Liveness: the process is up and serving requests."""
    return HealthResponse(status="ok")


@router.get("/ready", response_model=HealthResponse, responses={503: {"model": HealthResponse}})
async def ready() -> JSONResponse:
    """Readiness: dependencies (MongoDB) are reachable."""
    try:
        await asyncio.wait_for(get_async_mongo_client().admin.command("ping"), timeout=2)
    except Exception:  # noqa: BLE001 - any failure means "not ready"; the traceback is logged
        logger.opt(exception=True).warning("Readiness check failed")
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return JSONResponse(content={"status": "ok"})
