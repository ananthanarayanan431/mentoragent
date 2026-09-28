"""FastAPI application factory.

Run with ``mentoragent serve`` or ``uvicorn mentoragent.api.main:app``.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from functools import partial
from typing import TYPE_CHECKING

from fastapi import Depends, FastAPI
from loguru import logger
from starlette.concurrency import run_in_threadpool

from mentoragent.api.dependencies import require_api_key
from mentoragent.api.routes import admin, chat, health, mentors
from mentoragent.bootstrap import build_conversation_service
from mentoragent.core.config import settings
from mentoragent.core.handlers import register_exception_handlers, register_middleware
from mentoragent.core.logging import configure_logging
from mentoragent.db.client import AsyncMongoRepository, close_mongo_clients
from mentoragent.infra.opik_utils import configure_opik
from mentoragent.models.mentor_extract import MentorExtract
from mentoragent.services.mentors import MentorService

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable
    from contextlib import AbstractAsyncContextManager

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Build shared resources once at start-up; release them on shutdown.

    Start-up fails fast if MongoDB is unreachable, so an orchestrator can
    restart the process instead of serving errors.
    """
    configure_logging()
    tracing = await run_in_threadpool(configure_opik)
    # Blocking: connects to MongoDB and creates checkpoint indexes.
    app.state.conversations = await run_in_threadpool(
        partial(build_conversation_service, tracing=tracing)
    )
    app.state.mentors = MentorService(
        AsyncMongoRepository(MentorExtract, settings.mongo.MENTORS_COLLECTION)
    )
    logger.info("{} API ready ({})", settings.app.PROJECT_NAME, settings.app.ENVIRONMENT)
    try:
        yield
    finally:
        await close_mongo_clients()
        logger.info("Shutdown complete")


def create_app(
    lifespan_handler: Callable[[FastAPI], AbstractAsyncContextManager[None]] = lifespan,
) -> FastAPI:
    """Create the FastAPI application.

    Args:
        lifespan_handler: Start-up/shutdown handler; tests pass one that
            installs fakes on ``app.state`` instead of connecting to MongoDB.
    """
    expose_docs = not settings.app.is_production
    app = FastAPI(
        title=settings.app.PROJECT_NAME,
        version=settings.app.APP_VERSION,
        description="Chat with AI mentors modelled on real experts.",
        lifespan=lifespan_handler,
        docs_url="/docs" if expose_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if expose_docs else None,
    )
    register_middleware(app)
    register_exception_handlers(app)

    protected = [Depends(require_api_key)]
    app.include_router(health.router)
    app.include_router(mentors.router, prefix=API_PREFIX, dependencies=protected)
    app.include_router(chat.router, prefix=API_PREFIX, dependencies=protected)
    app.include_router(admin.router, prefix=API_PREFIX, dependencies=protected)
    app.include_router(chat.websocket_router, prefix=API_PREFIX)
    return app


app = create_app()
