from __future__ import annotations

import json

import httpx
from pydantic import SecretStr

from mentor_agent.rag.extractors.firecrawl import EXCLUDE_TAGS, FirecrawlReader, plain_text


def _reader(handler: httpx.MockTransport) -> FirecrawlReader:
    return FirecrawlReader(
        SecretStr("fc-key"), base_url="https://fc.test", timeout=5, transport=handler
    )


def _page(markdown: str, status: int = 200, *, success: bool = True) -> httpx.Response:
    data = {"markdown": markdown, "metadata": {"statusCode": status}}
    return httpx.Response(200, json={"success": success, "data": data})


def test_plain_text_drops_images_and_keeps_link_text() -> None:
    markdown = "See ![chart](https://img.test/a.png)my [post](https://x.test/1) here"
    assert plain_text(markdown) == "See my post here"


def test_read_scrapes_main_content_with_the_key() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return _page("# Essay\n\nRead [this](https://a.test).")

    assert _reader(httpx.MockTransport(handler)).read("https://blog.test") == (
        "# Essay\n\nRead this."
    )
    (request,) = requests
    assert str(request.url) == "https://fc.test/v2/scrape"
    assert request.headers["authorization"] == "Bearer fc-key"
    assert json.loads(request.content) == {
        "url": "https://blog.test",
        "formats": ["markdown"],
        "onlyMainContent": True,
        "excludeTags": list(EXCLUDE_TAGS),
    }


def test_read_returns_nothing_for_missing_pages_and_failures() -> None:
    responses = [
        _page("Not found", status=404),
        _page("", success=False),
        httpx.Response(402),
        httpx.Response(200, content=b"not json"),
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        return responses.pop(0)

    reader = _reader(httpx.MockTransport(handler))
    assert [reader.read("https://blog.test") for _ in range(4)] == ["", "", "", ""]


def test_read_returns_nothing_when_the_network_fails() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    assert _reader(httpx.MockTransport(handler)).read("https://blog.test") == ""
