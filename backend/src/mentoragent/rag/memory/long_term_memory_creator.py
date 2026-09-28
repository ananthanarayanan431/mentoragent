from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

from mentoragent.core.config import settings
from mentoragent.db.indexes import create_search_indexes
from mentoragent.rag.deduplicate_documents import DeduplicateDocuments
from mentoragent.rag.extractor import Extractor
from mentoragent.rag.retrievers import build_vector_store
from mentoragent.rag.splitters import build_text_splitter

if TYPE_CHECKING:
    from langchain_mongodb import MongoDBAtlasVectorSearch
    from langchain_text_splitters import TextSplitter


class LongTermMemoryCreator:
    """Rebuild the mentors' long-term memory: extract, chunk, dedupe, embed, index.

    Dependencies are injected so each can be swapped or faked; use
    :meth:`build` for the configured defaults.

    Args:
        vectorstore: Vector store that receives the chunks.
        splitter: Splits extracted documents into chunks.
        extractor: Yields ``(mentor, documents)`` for every mentor.
        deduplicator: Drops near-duplicate chunks before embedding.
    """

    def __init__(
        self,
        vectorstore: MongoDBAtlasVectorSearch,
        splitter: TextSplitter,
        extractor: Extractor,
        deduplicator: DeduplicateDocuments,
    ) -> None:
        self.vectorstore = vectorstore
        self.splitter = splitter
        self.extractor = extractor
        self.deduplicator = deduplicator

    @classmethod
    def build(cls) -> LongTermMemoryCreator:
        """Create an instance wired from settings."""
        return cls(build_vector_store(), build_text_splitter(), Extractor(), DeduplicateDocuments())

    def __call__(self, *, sample: bool = False, sample_count: int = 2) -> int:
        """Replace the long-term memory with freshly extracted documents.

        The collection is emptied first, so retrieval returns nothing until
        ingestion finishes; run this as an offline job, not while serving.

        Args:
            sample: Extract only ``sample_count`` documents per source, for a
                quick smoke run.
            sample_count: Documents kept per source when ``sample`` is set.

        Returns:
            The number of chunks ingested.
        """
        deleted = self.vectorstore.collection.delete_many({}).deleted_count
        logger.info("Cleared long-term memory ({} documents)", deleted)

        total = 0
        for mentor, docs in self.extractor.get_extraction_generator(
            is_sample_data=sample, sample_count=sample_count
        ):
            chunks = self.deduplicator.remove_duplicates(self.splitter.split_documents(docs))
            if not chunks:
                logger.warning("No chunks to ingest for {}", mentor.id)
                continue
            self.vectorstore.add_documents(chunks)
            total += len(chunks)
            logger.info("Ingested {} chunks for {}", len(chunks), mentor.id)

        create_search_indexes(
            self.vectorstore,
            embedding_dim=settings.rag.TEXT_EMBEDDING_MODEL_DIM,
            fulltext_index=settings.rag.FULLTEXT_INDEX_NAME,
        )
        logger.info("Long-term memory rebuilt with {} chunks", total)
        return total
