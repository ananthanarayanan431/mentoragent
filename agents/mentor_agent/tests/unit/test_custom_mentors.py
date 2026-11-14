from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest

from mentor_agent.services.custom import new_mentor_id, slugify
from mentor_agent.services.mentors import MentorService
from mentor_agent.services.persona import (
    NOTES_CHAR_BUDGET,
    LlmPersonaWriter,
    Persona,
    fallback_persona,
)

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from mentor_agent.db.client import AsyncMongoRepository
    from mentor_agent.models.mentor_extract import MentorExtract


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Grace Hopper", "grace_hopper"),
        ("José O'Brien", "jose_o_brien"),
        ("  --  ", "mentor"),
        ("李雷", "mentor"),
        ("a" * 80, "a" * 48),
    ],
)
def test_slugify(name: str, slug: str) -> None:
    assert slugify(name) == slug


def test_new_mentor_id_skips_taken_ids() -> None:
    assert new_mentor_id("Ada", set()) == "ada"
    assert new_mentor_id("Ada", {"ada", "ada_2"}) == "ada_3"


def _same(mentor: MentorExtract) -> MentorExtract:
    return mentor


async def test_add_custom_inserts_with_memory_building() -> None:
    repository = MagicMock()
    repository.ids = AsyncMock(return_value={"ada"})
    repository.insert_one = AsyncMock(side_effect=_same)
    service = MentorService(cast("AsyncMongoRepository[MentorExtract]", repository))

    mentor = await service.add_custom(
        {"name": "Ada", "expertise": "e", "perspective": "p", "style": "s", "notes": ["n"]}
    )

    assert (mentor.id, mentor.memory, mentor.notes) == ("ada_2", "building", ["n"])
    repository.insert_one.assert_awaited_once()


def _model(result: Any = None, error: Exception | None = None) -> MagicMock:
    structured = MagicMock()
    structured.ainvoke = AsyncMock(return_value=result, side_effect=error)
    model = MagicMock()
    model.with_structured_output.return_value = structured
    return model


async def test_persona_writer_returns_the_model_persona() -> None:
    persona = Persona(expertise="Compilers", perspective="Ship it", style="Blunt")
    model = _model(result=persona)
    writer = LlmPersonaWriter(lambda: cast("BaseChatModel", model))

    assert await writer.write("Grace", ["x" * (NOTES_CHAR_BUDGET + 500)]) == persona

    prompt = model.with_structured_output.return_value.ainvoke.await_args.args[0][1].content
    assert prompt.startswith("Name: Grace")
    assert len(prompt) < NOTES_CHAR_BUDGET + 100


async def test_persona_writer_falls_back_when_the_model_fails() -> None:
    writer = LlmPersonaWriter(lambda: cast("BaseChatModel", _model(error=RuntimeError("down"))))
    assert await writer.write("Grace", []) == fallback_persona("Grace")


async def test_persona_writer_falls_back_without_a_model() -> None:
    def no_key() -> BaseChatModel:
        msg = "ANTHROPIC_API_KEY is not set"
        raise RuntimeError(msg)

    assert await LlmPersonaWriter(no_key).write("Grace", []) == fallback_persona("Grace")
