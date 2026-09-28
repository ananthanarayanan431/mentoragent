from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_community.document_loaders import WikipediaLoader
from loguru import logger

from mentoragent.rag.extractors.base import Source, make_document

if TYPE_CHECKING:
    from langchain_core.documents import Document

    from mentoragent.models.mentor_extract import MentorExtract


def extract_wikipedia(
    mentor_extract: MentorExtract,
    max_docs: int = 10,
    max_chars_per_doc: int = 1_000_000,
) -> list[Document]:
    """Load the Wikipedia pages that match the mentor's name.

    Args:
        mentor_extract: The mentor to search Wikipedia for.
        max_docs: Maximum number of pages to load.
        max_chars_per_doc: Truncate each page to this many characters.

    Returns:
        One document per page, or an empty list if the search fails.
    """
    log = logger.bind(mentor_id=mentor_extract.id, source=Source.WIKIPEDIA)

    try:
        pages = WikipediaLoader(
            query=mentor_extract.name,
            lang="en",
            load_max_docs=max_docs,
            doc_content_chars_max=max_chars_per_doc,
        ).load()
    except Exception:
        log.exception("Failed to load Wikipedia pages for {!r}", mentor_extract.name)
        return []

    documents = [
        make_document(
            mentor_extract, page.page_content, Source.WIKIPEDIA, page.metadata.get("source", "")
        )
        for page in pages
    ]
    log.info("Extracted {} Wikipedia pages", len(documents))
    return documents
