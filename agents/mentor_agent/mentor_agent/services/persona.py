"""Writes a persona (expertise, perspective, style) for a mentor you create yourself."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger
from pydantic import BaseModel, Field

from mentor_agent.prompts import PERSONA_SYSTEM_PROMPT

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from langchain_core.language_models import BaseChatModel

#: How much pasted text the model sees; enough to catch someone's voice, cheap to send.
NOTES_CHAR_BUDGET = 8_000


class Persona(BaseModel):
    """The three persona fields every mentor has."""

    expertise: str = Field(min_length=1, max_length=600)
    perspective: str = Field(min_length=1, max_length=600)
    style: str = Field(min_length=1, max_length=600)


def fallback_persona(name: str) -> Persona:
    """A neutral persona for when no model is available; the user can edit it later."""
    return Persona(
        expertise=f"The ideas and experience {name} has shared publicly",
        perspective=f"Answers the way {name} would, from the material added for them.",
        style="Clear and direct, drawing on concrete examples.",
    )


class PersonaWriter(Protocol):
    """Writes a persona from a name and pasted notes; never raises."""

    async def write(self, name: str, notes: Sequence[str]) -> Persona: ...


def _prompt(name: str, notes: Sequence[str]) -> str:
    text = "\n\n---\n\n".join(note.strip() for note in notes if note.strip())
    if not text:
        return f"Name: {name}"
    return f"Name: {name}\n\nText by or about them:\n{text[:NOTES_CHAR_BUDGET]}"


class LlmPersonaWriter:
    """Asks a chat model for the persona, falling back to a neutral one on any failure.

    Args:
        model_factory: Builds the chat model on first use, so the API starts without
            an Anthropic key and only this feature needs one.
    """

    def __init__(self, model_factory: Callable[[], BaseChatModel]) -> None:
        self.model_factory = model_factory

    async def write(self, name: str, notes: Sequence[str]) -> Persona:
        try:
            model = self.model_factory().with_structured_output(Persona)
            result = await model.ainvoke(
                [
                    SystemMessage(content=PERSONA_SYSTEM_PROMPT),
                    HumanMessage(content=_prompt(name, notes)),
                ]
            )
            return Persona.model_validate(result)
        except Exception:  # noqa: BLE001 - optional enrichment: a neutral persona still works
            logger.exception("Could not write a persona; using a neutral one")
            return fallback_persona(name)
