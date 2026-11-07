"""Admin bodies."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ResetMemoryResponse(BaseModel):
    """Collections dropped by a memory reset."""

    dropped_collections: list[str] = Field(default_factory=list)
