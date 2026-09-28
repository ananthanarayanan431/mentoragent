from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_community.document_loaders import PyPDFLoader
from loguru import logger

from mentoragent.rag.extractors.base import Source, make_document

if TYPE_CHECKING:
    from langchain_core.documents import Document

    from mentoragent.models.mentor_extract import MentorExtract


def extract_pdf_contents(mentor_extract: MentorExtract) -> list[Document]:
    """Load every PDF listed for the mentor, one document per page.

    Args:
        mentor_extract: The mentor whose ``pdfs`` are loaded.

    Returns:
        One document per PDF page. PDFs that fail to load are skipped.
    """
    log = logger.bind(mentor_id=mentor_extract.id, source=Source.PDF)
    documents: list[Document] = []

    for pdf_url in mentor_extract.pdfs:
        try:
            pages = PyPDFLoader(pdf_url, mode="page").load()
        except Exception:
            log.exception("Failed to load PDF {}", pdf_url)
            continue

        documents.extend(
            make_document(mentor_extract, page.page_content, Source.PDF, pdf_url) for page in pages
        )

    log.info("Extracted {} PDF pages", len(documents))
    return documents
