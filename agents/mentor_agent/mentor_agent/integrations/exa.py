"""Looks a person up with Exa's search API, for text from pages the server cannot
read itself: LinkedIn profiles above all, plus the person's own site.

Optional: without ``EXA_API_KEY`` research runs on Claude's web search alone. The
results are untrusted web text and may describe someone else with the same name,
so they only ever reach the research model as fenced material.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Protocol

import httpx
from loguru import logger
from pydantic import BaseModel, Field, ValidationError

if TYPE_CHECKING:
    from collections.abc import Iterable

    from pydantic import SecretStr

    from mentor_agent.models.mentor_extract import MentorExtract

#: Exa categories searched for each person: "people" returns LinkedIn profiles.
CATEGORIES = ("people", "personal site")
#: Characters of page text kept from each result.
RESULT_CHAR_BUDGET = 1_500
#: Characters of the person's expertise added to the query, to tell namesakes apart.
QUERY_HINT_CHARS = 80


class ExaResult(BaseModel):
    """One search result, with the page text Exa read."""

    url: str
    title: str | None = None
    text: str | None = None


class ExaResponse(BaseModel):
    results: list[ExaResult] = Field(default_factory=list[ExaResult])


class LeadFinder(Protocol):
    """Finds web text about a mentor; returns ``""`` when it cannot (never raises)."""

    async def find(self, mentor: MentorExtract) -> str: ...


def search_query(mentor: MentorExtract) -> str:
    """The person's name, plus their expertise when the user gave one."""
    hint = mentor.expertise.strip()[:QUERY_HINT_CHARS]
    return f"{mentor.name} {hint}".strip()


def format_leads(results: Iterable[ExaResult]) -> str:
    """Results as plain text blocks, one per distinct URL."""
    blocks: list[str] = []
    seen: set[str] = set()
    for result in results:
        key = result.url.strip().rstrip("/")
        text = (result.text or "").strip()
        if not text or key in seen:
            continue
        seen.add(key)
        title = (result.title or "").strip()
        header = f"{result.url}\n{title}" if title else result.url
        blocks.append(f"{header}\n{text[:RESULT_CHAR_BUDGET]}")
    return "\n\n---\n\n".join(blocks)


class ExaLeadFinder:
    """Runs one Exa search per category and returns the page text it found.

    Args:
        api_key: The Exa API key.
        base_url: The Exa API endpoint.
        timeout: Timeout for one search, in seconds.
        results_per_search: Results kept from each search.
        transport: Replaces the network in tests.
    """

    def __init__(
        self,
        api_key: SecretStr,
        *,
        base_url: str,
        timeout: float,
        results_per_search: int,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.results_per_search = results_per_search
        self.transport = transport

    async def find(self, mentor: MentorExtract) -> str:
        query = search_query(mentor)
        async with httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
            transport=self.transport,
            headers={"x-api-key": self.api_key.get_secret_value()},
        ) as client:
            batches = await asyncio.gather(
                *(self._search(client, query, category, mentor.id) for category in CATEGORIES)
            )
        leads = format_leads(result for batch in batches for result in batch)
        logger.bind(mentor_id=mentor.id).info(
            "Exa found {} results", sum(len(batch) for batch in batches)
        )
        return leads

    async def _search(
        self, client: httpx.AsyncClient, query: str, category: str, mentor_id: str
    ) -> list[ExaResult]:
        body = {
            "query": query,
            "category": category,
            "numResults": self.results_per_search,
            "contents": {"text": {"maxCharacters": RESULT_CHAR_BUDGET}},
        }
        try:
            response = await client.post("/search", json=body)
            response.raise_for_status()
            return ExaResponse.model_validate_json(response.content).results
        except (httpx.HTTPError, ValidationError) as error:
            logger.bind(mentor_id=mentor_id).warning(
                "Exa search ({}) failed: {}", category, type(error).__name__
            )
            return []
