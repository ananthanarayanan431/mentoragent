from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, MagicMock

import anthropic
import httpx2 as httpx
import pytest

from mentor_agent.services.enrich import MentorEnricher, research_changes
from mentor_agent.services.research import (
    ClaudeResearcher,
    ResearchFindings,
    is_fetchable,
    new_links,
    seed_prompt,
)
from tests.fakes import FixedResearcher, InMemoryMentorService, RecordingMemoryBuilder

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.mentors import MentorService

FINDINGS = ResearchFindings(
    expertise="Compilers",
    perspective="Ship it",
    style="Blunt",
    profile="Rear admiral and computing pioneer.",
    youtube_videos=["https://youtu.be/new", "https://youtu.be/known"],
    websites=["https://www.linkedin.com/in/grace", "https://blog.test/essay"],
    pdfs=["http://insecure.test/a.pdf"],
)


@pytest.mark.parametrize(
    ("url", "ok"),
    [
        ("https://blog.test/essay", True),
        ("http://blog.test/essay", False),
        ("https://127.0.0.1/x", False),
        ("https://[::1]/x", False),
        ("https://localhost/x", False),
        ("https://printer.local/x", False),
        ("https://www.linkedin.com/in/x", False),
        ("https://x.com/someone", False),
        ("not a url", False),
    ],
)
def test_is_fetchable(url: str, ok: bool) -> None:
    assert is_fetchable(url) is ok


def test_new_links_skips_known_unreadable_and_duplicates() -> None:
    found = ["https://a.test/", "https://a.test", "https://b.test", "https://c.test"]
    assert new_links(found, ["https://known.test", "https://a.test"], limit=1) == ["https://b.test"]


def test_seed_prompt_carries_links_and_fenced_notes(mentor_extract: MentorExtract) -> None:
    mentor = mentor_extract.model_copy(update={"notes": ["My post"], "pdfs": []})
    prompt = seed_prompt(mentor)
    assert prompt.startswith("Research this person: Ada Lovelace")
    assert "https://x.com/ada" in prompt
    assert "<seed>\nMy post\n</seed>" in prompt


def test_research_changes_fill_blanks_add_new_links_and_the_profile(
    mentor_extract: MentorExtract,
) -> None:
    mentor = mentor_extract.model_copy(
        update={"youtube_videos": ["https://youtu.be/known"], "websites": [], "pdfs": []}
    )

    changes = research_changes(mentor, FINDINGS, write=["expertise"])

    assert changes["expertise"] == "Compilers"
    assert "style" not in changes
    assert changes["youtube_videos"] == ["https://youtu.be/known", "https://youtu.be/new"]
    assert changes["websites"] == ["https://blog.test/essay"]
    assert "pdfs" not in changes
    assert changes["notes"][-1].endswith("Rear admiral and computing pioneer.")


# The Claude researcher


def _response(stop_reason: str, *texts: str) -> SimpleNamespace:
    content = [SimpleNamespace(type="server_tool_use")] + [
        SimpleNamespace(type="text", text=text) for text in texts
    ]
    return SimpleNamespace(stop_reason=stop_reason, content=content)


def _researcher(
    responses: list[Any] | Exception, extracted: Any = FINDINGS
) -> tuple[ClaudeResearcher, AsyncMock]:
    create = AsyncMock(side_effect=responses)
    client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(create=create)))
    structured = MagicMock()
    structured.ainvoke = AsyncMock(return_value=extracted)
    extract_model = MagicMock()
    extract_model.with_structured_output.return_value = structured
    researcher = ClaudeResearcher(
        lambda: cast("anthropic.AsyncAnthropic", client),
        lambda: cast("BaseChatModel", extract_model),
        model="claude-sonnet-5-5",
        max_searches=3,
    )
    return researcher, create


async def test_research_resumes_a_paused_search_and_extracts_findings(
    mentor_extract: MentorExtract,
) -> None:
    first = _response("pause_turn", "Part one.")
    researcher, create = _researcher([first, _response("end_turn", "Part two.")])

    assert await researcher.research(mentor_extract) == FINDINGS

    assert create.await_count == 2
    resumed = create.await_args_list[1].kwargs["messages"]
    assert resumed[1] == {"role": "assistant", "content": first.content}
    tools = create.await_args_list[0].kwargs["tools"]
    assert [t["type"] for t in tools] == ["web_search_20260209", "web_fetch_20260209"]
    assert tools[0]["max_uses"] == 3


async def test_research_returns_none_on_api_error(mentor_extract: MentorExtract) -> None:
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    researcher, _ = _researcher(anthropic.APIConnectionError(request=request))
    assert await researcher.research(mentor_extract) is None


async def test_research_returns_none_when_declined(mentor_extract: MentorExtract) -> None:
    researcher, _ = _researcher([_response("refusal", "No.")])
    assert await researcher.research(mentor_extract) is None


async def test_research_returns_none_when_the_report_cannot_be_read(
    mentor_extract: MentorExtract,
) -> None:
    researcher, _ = _researcher([_response("end_turn", "Report")], extracted={"bad": 1})
    assert await researcher.research(mentor_extract) is None


# The enricher


class _Personas:
    async def write(self, name: str, notes: Any) -> Any:
        return SimpleNamespace(expertise="E", perspective="P", style="S")


def _enricher(
    mentor: MentorExtract, findings: ResearchFindings | None
) -> tuple[MentorEnricher, InMemoryMentorService, FixedResearcher, RecordingMemoryBuilder]:
    mentors = InMemoryMentorService([mentor])
    researcher = FixedResearcher(findings)
    memory = RecordingMemoryBuilder()
    enricher = MentorEnricher(cast("MentorService", mentors), researcher, _Personas(), memory)
    return enricher, mentors, researcher, memory


async def test_enrich_applies_research_then_builds_memory(mentor_extract: MentorExtract) -> None:
    enricher, mentors, _, memory = _enricher(mentor_extract, FINDINGS)

    await enricher.enrich("ada", research=True, write=["style"])

    assert mentors.mentors["ada"].style == "Blunt"
    assert mentors.mentors["ada"].expertise == "Mathematics"
    assert memory.requested == ["ada"]


async def test_enrich_writes_the_persona_when_research_fails(
    mentor_extract: MentorExtract,
) -> None:
    enricher, mentors, researcher, memory = _enricher(mentor_extract, None)

    await enricher.enrich("ada", research=True, write=["perspective"])

    assert researcher.researched == ["ada"]
    assert mentors.mentors["ada"].perspective == "P"
    assert memory.requested == ["ada"]


async def test_enrich_without_research_or_blanks_only_builds_memory(
    mentor_extract: MentorExtract,
) -> None:
    enricher, mentors, researcher, memory = _enricher(mentor_extract, FINDINGS)

    await enricher.enrich("ada", research=False, write=[])

    assert researcher.researched == []
    assert mentors.mentors["ada"] == mentor_extract
    assert memory.requested == ["ada"]


async def test_enrich_still_builds_memory_when_the_mentor_is_gone(
    mentor_extract: MentorExtract,
) -> None:
    enricher, _, _, memory = _enricher(mentor_extract, FINDINGS)
    await enricher.enrich("missing", research=True, write=[])
    assert memory.requested == ["missing"]
