from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

from mentor_agent.rag.extractors.base import Source, make_document

if TYPE_CHECKING:
    from langchain_core.documents import Document

    from mentor_agent.models.mentor_extract import MentorExtract


def extract_notes(mentor_extract: MentorExtract) -> list[Document]:
    """Turn the text pasted in for the mentor (LinkedIn posts, newsletters) into documents.

    Sites like LinkedIn need a login to read, so their content is pasted rather than
    fetched.

    Args:
        mentor_extract: The mentor whose ``notes`` are used.

    Returns:
        One document per non-blank note, in order.
    """
    documents = [
        make_document(mentor_extract, note.strip(), Source.NOTE, f"note:{index}")
        for index, note in enumerate(mentor_extract.notes, start=1)
        if note.strip()
    ]
    logger.bind(mentor_id=mentor_extract.id, source=Source.NOTE).info(
        "Extracted {} pasted notes", len(documents)
    )
    return documents
