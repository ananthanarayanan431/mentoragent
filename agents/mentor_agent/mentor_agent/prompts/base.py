"""The named prompt template type shared by every Opik-versioned prompt."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Prompt:
    """A named prompt template.

    Attributes:
        name: Stable identifier, also used as the Opik prompt name.
        prompt: The Jinja2 template text.
    """

    name: str
    prompt: str

    def __str__(self) -> str:
        return self.prompt
