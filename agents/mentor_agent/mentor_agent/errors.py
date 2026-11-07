"""Errors: the domain exceptions and the handlers that turn them into responses.

Every exception raised on purpose by the application derives from
:class:`MentorAgentError`, which carries the HTTP status the API should map
it to. The handlers here are the only code that writes an error body, so
adding a new error is one small subclass. Install them with
:func:`install_error_handlers`.
"""

from __future__ import annotations

import traceback
from typing import TYPE_CHECKING, Any, ClassVar

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import ValidationError

from mentor_agent.config import settings

if TYPE_CHECKING:
    from fastapi import FastAPI, Request


class MentorAgentError(Exception):
    """Base class for all application errors.

    Attributes:
        status_code: HTTP status returned when this reaches the API boundary.
        default_message: Message used when none is passed.
        message: The error message.
    """

    status_code: ClassVar[int] = 500
    default_message: ClassVar[str] = "Internal error"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


class PermissionDeniedError(MentorAgentError):
    """The user lacks the permission required to perform an action."""

    status_code = 403
    default_message = "User does not have the right to perform this action"


class ConversationError(MentorAgentError):
    """The agent failed to produce a reply (LLM provider or retrieval failure)."""

    status_code = 502
    default_message = "The mentor could not respond right now. Please try again."


class NotFoundError(MentorAgentError):
    """A requested object does not exist."""

    status_code = 404
    default_message = "Object not found"


class MentorNotFoundError(NotFoundError):
    """No mentor exists for the given id."""

    field: ClassVar[str] = "Mentor"

    def __init__(self, mentor_id: str) -> None:
        self.mentor_id = mentor_id
        super().__init__(f"{self.field} for id {mentor_id} not found.")


class MentorNameNotFoundError(MentorNotFoundError):
    """The mentor exists but has no name."""

    field = "Mentor name"


class MentorPerspectiveNotFoundError(MentorNotFoundError):
    """The mentor exists but has no perspective."""

    field = "Mentor perspective"


class MentorStyleNotFoundError(MentorNotFoundError):
    """The mentor exists but has no style."""

    field = "Mentor style"


class MentorExpertiseNotFoundError(MentorNotFoundError):
    """The mentor exists but has no expertise."""

    field = "Mentor expertise"


def unpack_validation_error(
    exc: ValidationError | RequestValidationError,
) -> dict[str, list[dict[str, Any]]]:
    """Flatten a Pydantic validation error into ``{"errors": [{loc: msg}, ...]}``.

    Args:
        exc: The Pydantic (or FastAPI request) validation error.

    Returns:
        The error messages keyed by dotted field location.
    """
    return {
        "errors": [
            {".".join(str(loc) for loc in error["loc"]): error["msg"]} for error in exc.errors()
        ]
    }


# --- Exception handlers ----------------------------------------------------------


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
        if "site-packages" not in frame.filename and "/mentor_agent" in frame.filename
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


def install_error_handlers(app: FastAPI) -> None:
    """Register every exception handler on the app."""
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(ValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(MentorAgentError, mentor_agent_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)
