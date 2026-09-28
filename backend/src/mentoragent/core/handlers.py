"""Middleware and exception handlers for the FastAPI application.

Wire everything onto an app with two calls::

    app = FastAPI()
    register_middleware(app)
    register_exception_handlers(app)
"""

from __future__ import annotations

import time
import traceback
import uuid
from typing import TYPE_CHECKING

from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import ValidationError

from mentoragent.core.config import settings
from mentoragent.core.exceptions import MentorAgentError, unpack_validation_error

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


def register_middleware(app: FastAPI) -> None:
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


async def validation_exception_handler(
    request: Request, exc: RequestValidationError | ValidationError
) -> JSONResponse:
    """Return 422 with the validation errors keyed by field location.

    Example body::

        {"errors": [{"body.email": "field required"}]}

    During local development the response also carries the exception type
    and the project frames of the traceback, to speed up debugging.
    """
    error_messages = unpack_validation_error(exc)
    logger.warning("Validation error on {}: {}", request.url.path, error_messages)

    if not settings.app.LOCAL_DEVELOPMENT:
        return JSONResponse(status_code=422, content=error_messages)

    stack_trace = [
        f"{frame.filename.rsplit('/', 1)[-1]}:{frame.name}:{frame.lineno}"
        for frame in traceback.extract_tb(exc.__traceback__)
        if "site-packages" not in frame.filename and "/mentoragent" in frame.filename
    ]
    return JSONResponse(
        status_code=422,
        content={
            "type": exc.__class__.__name__,
            "stack_trace": stack_trace,
            "error_messages": error_messages,
        },
    )


async def mentor_agent_error_handler(request: Request, exc: MentorAgentError) -> JSONResponse:
    """Map any :class:`MentorAgentError` to its declared HTTP status."""
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log an unexpected error with its traceback and return a generic 500.

    The exception detail is never sent to the client.
    """
    logger.opt(exception=exc).error(
        "Unhandled exception on {} {}", request.method, request.url.path
    )
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


def register_exception_handlers(app: FastAPI) -> None:
    """Register every exception handler on the app."""
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(ValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(MentorAgentError, mentor_agent_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)
