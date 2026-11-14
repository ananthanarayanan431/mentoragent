from __future__ import annotations

import json
from typing import TYPE_CHECKING

import httpx
from pydantic import SecretStr

from mentor_agent.services.exa import (
    RESULT_CHAR_BUDGET,
    ExaLeadFinder,
    ExaResult,
    format_leads,
    search_query,
)

if TYPE_CHECKING:
    from mentor_agent.models.mentor_extract import MentorExtract


def _finder(handler: httpx.MockTransport) -> ExaLeadFinder:
    return ExaLeadFinder(
        SecretStr("exa-key"),
        base_url="https://exa.test",
        timeout=5,
        results_per_search=2,
        transport=handler,
    )


def test_search_query_adds_expertise_when_given(mentor_extract: MentorExtract) -> None:
    assert search_query(mentor_extract) == "Ada Lovelace Mathematics"
    blank = mentor_extract.model_copy(update={"expertise": "  "})
    assert search_query(blank) == "Ada Lovelace"


def test_format_leads_skips_empty_and_duplicate_results_and_trims_text() -> None:
    results = [
        ExaResult(url="https://linkedin.com/in/ada", title="Ada", text="Profile"),
        ExaResult(url="https://linkedin.com/in/ada/", text="Same page again"),
        ExaResult(url="https://empty.test", text="  "),
        ExaResult(url="https://ada.test", text="x" * (RESULT_CHAR_BUDGET + 10)),
    ]

    leads = format_leads(results)

    assert leads.startswith("https://linkedin.com/in/ada\nAda\nProfile")
    assert "Same page again" not in leads
    assert "empty.test" not in leads
    assert leads.endswith("https://ada.test\n" + "x" * RESULT_CHAR_BUDGET)


async def test_find_searches_each_category_with_the_key(mentor_extract: MentorExtract) -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        category = json.loads(request.content)["category"]
        result = {"url": f"https://{category.replace(' ', '-')}.test", "text": category}
        return httpx.Response(200, json={"results": [result]})

    leads = await _finder(httpx.MockTransport(handler)).find(mentor_extract)

    bodies = [json.loads(request.content) for request in requests]
    assert sorted(body["category"] for body in bodies) == ["people", "personal site"]
    assert all(body["numResults"] == 2 for body in bodies)
    assert all(request.headers["x-api-key"] == "exa-key" for request in requests)
    assert all(str(request.url) == "https://exa.test/search" for request in requests)
    assert "https://people.test\npeople" in leads
    assert "https://personal-site.test\npersonal site" in leads


async def test_find_keeps_what_worked_when_a_search_fails(mentor_extract: MentorExtract) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["category"] == "people":
            return httpx.Response(500)
        return httpx.Response(200, json={"results": [{"url": "https://ada.test", "text": "Site"}]})

    assert await _finder(httpx.MockTransport(handler)).find(mentor_extract) == (
        "https://ada.test\nSite"
    )


async def test_find_returns_nothing_on_bad_responses(mentor_extract: MentorExtract) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if json.loads(request.content)["category"] == "people":
            return httpx.Response(200, content=b"not json")
        raise httpx.ConnectError("down", request=request)

    assert await _finder(httpx.MockTransport(handler)).find(mentor_extract) == ""
