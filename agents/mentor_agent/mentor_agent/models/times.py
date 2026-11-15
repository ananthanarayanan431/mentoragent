"""Datetimes stored in MongoDB come back without a timezone; these are UTC."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


#: A datetime that is always timezone-aware: naive values (as pymongo returns
#: them) are read as UTC, so comparisons and JSON output are unambiguous.
UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]
