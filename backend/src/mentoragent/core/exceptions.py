"""Domain exceptions.

Every exception raised on purpose by the application derives from
:class:`MentorAgentError`, which carries the HTTP status the API should map
it to. The FastAPI handler in :mod:`mentoragent.core.handlers` therefore
needs a single registration, and adding a new error is one small subclass.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, ClassVar

if TYPE_CHECKING:
    from fastapi.exceptions import RequestValidationError
    from pydantic import ValidationError


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


class PermissionException(MentorAgentError):
    """The user lacks the permission required to perform an action."""

    status_code = 403
    default_message = "User does not have the right to perform this action"


class NotFoundException(MentorAgentError):
    """A requested object does not exist."""

    status_code = 404
    default_message = "Object not found"


class MentorNotFoundException(NotFoundException):
    """No mentor exists for the given id."""

    field: ClassVar[str] = "Mentor"

    def __init__(self, mentor_id: str) -> None:
        self.mentor_id = mentor_id
        super().__init__(f"{self.field} for id {mentor_id} not found.")


class MentorNameNotFoundException(MentorNotFoundException):
    """The mentor exists but has no name."""

    field = "Mentor name"


class MentorPerspectiveNotFoundException(MentorNotFoundException):
    """The mentor exists but has no perspective."""

    field = "Mentor perspective"


class MentorStyleNotFoundException(MentorNotFoundException):
    """The mentor exists but has no style."""

    field = "Mentor style"


class MentorExpertiseNotFoundException(MentorNotFoundException):
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
