from __future__ import annotations

import pytest
from pydantic import BaseModel, ValidationError

from mentoragent.core.exceptions import (
    MentorAgentError,
    MentorStyleNotFoundException,
    NotFoundException,
    PermissionException,
    unpack_validation_error,
)


def test_default_messages_and_status_codes() -> None:
    assert PermissionException().status_code == 403
    assert NotFoundException().message == "Object not found"
    assert NotFoundException("custom").message == "custom"


def test_mentor_errors_are_not_found_errors() -> None:
    exc = MentorStyleNotFoundException("ada")
    assert isinstance(exc, NotFoundException)
    assert isinstance(exc, MentorAgentError)
    assert exc.status_code == 404
    assert str(exc) == "Mentor style for id ada not found."
    assert exc.mentor_id == "ada"


def test_unpack_validation_error_flattens_locations() -> None:
    class Inner(BaseModel):
        age: int

    class Outer(BaseModel):
        inner: Inner

    with pytest.raises(ValidationError) as exc_info:
        Outer.model_validate({"inner": {"age": "x"}})

    errors = unpack_validation_error(exc_info.value)["errors"]
    assert list(errors[0]) == ["inner.age"]
