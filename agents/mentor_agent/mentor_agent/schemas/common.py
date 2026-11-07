"""Field types shared by more than one schema."""

from __future__ import annotations

from typing import Annotated

from pydantic import StringConstraints

MentorId = Annotated[str, StringConstraints(min_length=1, max_length=128)]
# Restricted alphabet: the id becomes part of the checkpointer thread id.
ConversationId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]
