"""FastAPI application factory.

The lifespan is the one place shared resources are built (the conversation
service, the mentor catalogue) and torn down. Entry point: ``mentor_agent.main``.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from functools import partial
from typing import TYPE_CHECKING

from fastapi import FastAPI
from loguru import logger
from starlette.concurrency import run_in_threadpool

from mentor_agent.bootstrap import build_conversation_service
from mentor_agent.config import settings
from mentor_agent.db.client import AsyncMongoRepository, close_mongo_clients
from mentor_agent.errors import install_error_handlers
from mentor_agent.logs import configure_logging
from mentor_agent.models.mentor_extract import MentorExtract
from mentor_agent.request_context import install_middleware
from mentor_agent.routes import health, v1
from mentor_agent.services.memory import MentorMemoryBuilder
from mentor_agent.services.mentors import MentorService
from mentor_agent.services.pool import load_pool
from mentor_agent.tracing import configure_opik

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Callable
    from contextlib import AbstractAsyncContextManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
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
    app.state.pool = _load_pool()
    app.state.memory = MentorMemoryBuilder(app.state.mentors, _rebuild_one)
    logger.info("{} API ready ({})", settings.app.PROJECT_NAME, settings.app.ENVIRONMENT)
    try:
        yield
    finally:
        await close_mongo_clients()
        logger.info("Shutdown complete")


def _load_pool() -> list[MentorExtract]:
    """The "Add a mentor" pool; a missing file only means nothing can be added."""
    path = settings.paths.MENTOR_POOL_FILE_PATH
    try:
        return load_pool(path)
    except FileNotFoundError:
        logger.warning("No mentor pool at {}; adding mentors is disabled", path)
        return []


def _rebuild_one(mentor: MentorExtract) -> int:
    # Built per job (in a worker thread): the vector store and embeddings client
    # are cheap to create and need no state between builds.
    from mentor_agent.rag.memory.long_term_memory_creator import LongTermMemoryCreator

    return LongTermMemoryCreator.build().rebuild_one(mentor)


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
    install_middleware(app)
    install_error_handlers(app)

    app.include_router(health.router)
    app.include_router(v1.router)
    app.include_router(v1.websocket_router)
    return app
