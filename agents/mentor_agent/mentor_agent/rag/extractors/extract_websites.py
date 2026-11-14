from __future__ import annotations

import re
from typing import TYPE_CHECKING

from langchain_community.document_loaders import WebBaseLoader
from loguru import logger

from mentor_agent.rag.extractors.base import Source, make_document
from mentor_agent.rag.extractors.firecrawl import firecrawl_reader

if TYPE_CHECKING:
    from langchain_core.documents import Document

    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.rag.extractors.firecrawl import PageReader

_TIMEOUT_SECONDS = 20
_BLANK_LINES = re.compile(r"\n\s*\n+")


def _clean(text: str) -> str:
    """Collapse the runs of blank lines a page's markup leaves behind."""
    return _BLANK_LINES.sub("\n\n", text).strip()


def _fetch(url: str) -> str:
    """The page's visible text with a plain fetch; raises when it cannot load."""
    pages = WebBaseLoader(
        web_paths=[url],
        requests_kwargs={"timeout": _TIMEOUT_SECONDS},
        raise_for_status=True,
    ).load()
    return "\n\n".join(page.page_content for page in pages)


def extract_websites(
    mentor_extract: MentorExtract, reader: PageReader | None = None
) -> list[Document]:
    """Load the text of every web page listed for the mentor.

    Firecrawl reads each page first when it is configured (main content only);
    a plain fetch is the fallback, and the only reader without a key.

    Args:
        mentor_extract: The mentor whose ``websites`` are fetched.
        reader: Reads a page before the plain fetch; defaults to Firecrawl
            when ``FIRECRAWL_API_KEY`` is set.

    Returns:
        One document per page. Pages that fail to load or have no text are skipped.
    """
    log = logger.bind(mentor_id=mentor_extract.id, source=Source.WEBSITE)
    reader = reader or firecrawl_reader()
    documents: list[Document] = []

    for url in mentor_extract.websites:
        text = _clean(reader.read(url)) if reader else ""
        if not text:
            try:
                text = _clean(_fetch(url))
            except Exception:
                log.exception("Failed to load web page {}", url)
                continue

        if not text:
            log.warning("No text on web page {}", url)
            continue
        documents.append(make_document(mentor_extract, text, Source.WEBSITE, url))

    log.info("Extracted {} web pages", len(documents))
    return documents
