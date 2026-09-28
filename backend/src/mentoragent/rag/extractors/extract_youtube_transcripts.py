from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_community.document_loaders import YoutubeLoader
from loguru import logger

from mentoragent.rag.extractors.base import Source, make_document

if TYPE_CHECKING:
    from langchain_core.documents import Document

    from mentoragent.models.mentor_extract import MentorExtract


def extract_youtube_transcripts(mentor_extract: MentorExtract) -> list[Document]:
    """Load the English transcript of every YouTube video listed for the mentor.

    Args:
        mentor_extract: The mentor whose ``youtube_videos`` are transcribed.

    Returns:
        One document per video. Videos without a usable transcript are skipped.
    """
    log = logger.bind(mentor_id=mentor_extract.id, source=Source.YOUTUBE)
    documents: list[Document] = []

    for youtube_url in mentor_extract.youtube_videos:
        try:
            transcript = YoutubeLoader.from_youtube_url(
                youtube_url, add_video_info=False, language=["en"]
            ).load()
        except Exception:
            log.exception("Failed to load transcript for {}", youtube_url)
            continue

        if not transcript:
            log.warning("No transcript available for {}", youtube_url)
            continue

        content = "\n".join(part.page_content for part in transcript)
        documents.append(make_document(mentor_extract, content, Source.YOUTUBE, youtube_url))

    log.info("Extracted {} YouTube transcripts", len(documents))
    return documents
