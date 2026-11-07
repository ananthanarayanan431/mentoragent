"""Request context: a request id on every request and log line, plus CORS.

Install with :func:`install_middleware`. Error responses are in :mod:`mentor_agent.errors`.
"""

from __future__ import annotations

import time
import uuid
from typing import TYPE_CHECKING

from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from mentor_agent.config import settings

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from fastapi import FastAPI, Request, Response

REQUEST_ID_HEADER = "X-Request-ID"


async def request_context_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Tag the request with an id, bind it to every log line, and log timing.

    An incoming ``X-Request-ID`` (e.g. from a load balancer) is reused so a
    request can be traced across services; otherwise a new one is generated.
    The id is echoed back in the response header.
    """
    request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
    request.state.request_id = request_id

    with logger.contextualize(request_id=request_id):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "{} {} -> {} in {:.1f}ms",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )

    response.headers[REQUEST_ID_HEADER] = request_id
    return response


def install_middleware(app: FastAPI) -> None:
    """Install CORS and request-context middleware.

    CORS uses Starlette's implementation with an explicit allow-list; origins
    come from ``ADDITIONAL_CORS_ORIGINS``.
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors.ADDITIONAL_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[REQUEST_ID_HEADER],
    )
    app.middleware("http")(request_context_middleware)
