"""Shared contract for the knowledge-source extractors.

Every extractor is a plain function ``(MentorExtract) -> list[Document]``.
Extractors never raise for a bad source: a failing URL is logged and
skipped so one dead link cannot abort ingestion for a whole mentor.
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Protocol

from langchain_core.documents import Document

if TYPE_CHECKING:
    from mentoragent.models.mentor_extract import MentorExtract


class Source(StrEnum):
    """Where a document came from; stored as ``metadata["source"]``."""

    PDF = "pdf"
    TWITTER = "twitter"
    WIKIPEDIA = "wikipedia"
    YOUTUBE = "youtube"


class DocumentExtractor(Protocol):
    """Callable that turns a mentor's sources into LangChain documents."""

    def __call__(self, mentor_extract: MentorExtract, /) -> list[Document]: ...


def make_document(
    mentor_extract: MentorExtract, content: str, source: Source, source_url: str
) -> Document:
    """Build a document carrying the metadata every extractor attaches."""
    return Document(
        page_content=content,
        metadata={
            "mentor_id": mentor_extract.id,
            "mentor_name": mentor_extract.name,
            "source": source.value,
            "source_url": source_url,
        },
    )
