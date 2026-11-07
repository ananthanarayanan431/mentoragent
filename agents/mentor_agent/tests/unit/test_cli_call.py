from __future__ import annotations

from typing import TYPE_CHECKING, cast

import pytest
from langchain_core.messages import AIMessage

from mentor_agent.cli import call_mentor
from mentor_agent.errors import MentorNotFoundError
from tests.fakes import InMemoryMentorService, build_fake_conversation_service

if TYPE_CHECKING:
    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.mentors import MentorService


def _mentors(mentor_extract: MentorExtract) -> MentorService:
    # The in-memory fake has the same interface as MentorService.
    return cast("MentorService", InMemoryMentorService([mentor_extract]))


async def test_call_streams_the_reply(mentor_extract: MentorExtract) -> None:
    service, _, _ = build_fake_conversation_service(
        [AIMessage(content="Buy wonderful businesses.")]
    )
    written: list[str] = []

    used = await call_mentor(
        service,
        _mentors(mentor_extract),
        mentor_id=mentor_extract.id,
        query="What should I buy?",
        conversation_id="c1",
        write=written.append,
    )

    assert used == "c1"
    assert "".join(written) == "Buy wonderful businesses.\n"


async def test_call_rejects_an_unknown_mentor(mentor_extract: MentorExtract) -> None:
    service, _, _ = build_fake_conversation_service([])
    with pytest.raises(MentorNotFoundError):
        await call_mentor(
            service,
            _mentors(mentor_extract),
            mentor_id="nobody",
            query="Hi",
            conversation_id="c1",
            write=lambda _: None,
        )
