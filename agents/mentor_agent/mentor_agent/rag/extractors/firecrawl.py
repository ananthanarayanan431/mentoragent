"""Reads web pages through Firecrawl, which returns a page's main content as
markdown: no menus or footers, and pages that need JavaScript still render.

Optional: without ``FIRECRAWL_API_KEY`` pages are read with a plain fetch.
"""

from __future__ import annotations

import re
from typing import Protocol

import httpx
from loguru import logger
from pydantic import BaseModel, Field, SecretStr, ValidationError

from mentor_agent.config import settings

#: Left out of every page: comment threads hold other people's words, not the mentor's.
EXCLUDE_TAGS = (
    "iframe",
    "#disqus_thread",
    "#comments",
    ".comments",
    "[id*=comment]",
    "[class*=comment]",
)
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")


class PageReader(Protocol):
    """Reads one page's text; returns ``""`` when it cannot (never raises)."""

    def read(self, url: str) -> str: ...


class _Metadata(BaseModel):
    statusCode: int = 200  # noqa: N815 - Firecrawl's field name


class _Page(BaseModel):
    markdown: str = ""
    metadata: _Metadata = Field(default_factory=_Metadata)


class _ScrapeResponse(BaseModel):
    success: bool = False
    data: _Page | None = None


def plain_text(markdown: str) -> str:
    """Markdown without images, and links reduced to their text, so URLs do not
    crowd the text that gets embedded."""
    return _LINK.sub(r"\1", _IMAGE.sub("", markdown))


class FirecrawlReader:
    """Scrapes one page at a time with Firecrawl's ``/v2/scrape``.

    Args:
        api_key: The Firecrawl API key.
        base_url: The Firecrawl API endpoint.
        timeout: Timeout for one page, in seconds.
        transport: Replaces the network in tests.
    """

    def __init__(
        self,
        api_key: SecretStr,
        *,
        base_url: str,
        timeout: float,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.transport = transport

    def read(self, url: str) -> str:
        body = {
            "url": url,
            "formats": ["markdown"],
            "onlyMainContent": True,
            "excludeTags": list(EXCLUDE_TAGS),
        }
        headers = {"Authorization": f"Bearer {self.api_key.get_secret_value()}"}
        try:
            with httpx.Client(
                base_url=self.base_url,
                timeout=self.timeout,
                transport=self.transport,
                headers=headers,
            ) as client:
                response = client.post("/v2/scrape", json=body)
            response.raise_for_status()
            page = _ScrapeResponse.model_validate_json(response.content)
        except (httpx.HTTPError, ValidationError) as error:
            logger.warning("Firecrawl could not read {}: {}", url, type(error).__name__)
            return ""
        if not page.success or page.data is None or page.data.metadata.statusCode >= 400:
            logger.warning("Firecrawl got no page for {}", url)
            return ""
        return plain_text(page.data.markdown)


def firecrawl_reader() -> FirecrawlReader | None:
    """The Firecrawl reader when ``FIRECRAWL_API_KEY`` is set, else ``None``."""
    config = settings.firecrawl
    if config.API_KEY is None:
        return None
    return FirecrawlReader(config.API_KEY, base_url=config.BASE_URL, timeout=config.TIMEOUT_SECONDS)
