"""Document chunking."""

from __future__ import annotations

from langchain_text_splitters import RecursiveCharacterTextSplitter

from mentoragent.core.config import settings


def build_text_splitter(
    chunk_size: int | None = None, chunk_overlap: int | None = None
) -> RecursiveCharacterTextSplitter:
    """Return a token-based splitter (sizes are in ``cl100k_base`` tokens).

    Args:
        chunk_size: Tokens per chunk. Defaults to ``RAG_CHUNK_SIZE``.
        chunk_overlap: Tokens shared by consecutive chunks. Defaults to
            ``RAG_CHUNK_OVERLAP``.
    """
    return RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        encoding_name="cl100k_base",
        chunk_size=chunk_size or settings.rag.CHUNK_SIZE,
        chunk_overlap=settings.rag.CHUNK_OVERLAP if chunk_overlap is None else chunk_overlap,
    )
