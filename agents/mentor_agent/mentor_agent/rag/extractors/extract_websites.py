from __future__ import annotations

import re
from typing import TYPE_CHECKING

from langchain_community.document_loaders import WebBaseLoader
from loguru import logger

from mentor_agent.rag.extractors.base import Source, make_document

if TYPE_CHECKING:
    from langchain_core.documents import Document

    from mentor_agent.models.mentor_extract import MentorExtract

_TIMEOUT_SECONDS = 20
_BLANK_LINES = re.compile(r"\n\s*\n+")


def _clean(text: str) -> str:
    """Collapse the runs of blank lines a page's markup leaves behind."""
    return _BLANK_LINES.sub("\n\n", text).strip()


def extract_websites(mentor_extract: MentorExtract) -> list[Document]:
    """Load the visible text of every web page listed for the mentor.

    Args:
        mentor_extract: The mentor whose ``websites`` are fetched.

    Returns:
        One document per page. Pages that fail to load or have no text are skipped.
    """
    log = logger.bind(mentor_id=mentor_extract.id, source=Source.WEBSITE)
    documents: list[Document] = []

    for url in mentor_extract.websites:
        try:
            pages = WebBaseLoader(
                web_paths=[url],
                requests_kwargs={"timeout": _TIMEOUT_SECONDS},
                raise_for_status=True,
            ).load()
        except Exception:
            log.exception("Failed to load web page {}", url)
            continue

        text = _clean("\n\n".join(page.page_content for page in pages))
        if not text:
            log.warning("No text on web page {}", url)
            continue
        documents.append(make_document(mentor_extract, text, Source.WEBSITE, url))

    log.info("Extracted {} web pages", len(documents))
    return documents
