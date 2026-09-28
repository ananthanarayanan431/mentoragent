from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger

from mentoragent.core.config import settings
from mentoragent.db.indexes import create_search_indexes
from mentoragent.rag.deduplicate_documents import DeduplicateDocuments
from mentoragent.rag.extractor import Extractor
from mentoragent.rag.retrievers import Retriever
from mentoragent.rag.splitters import TextSplitter

if TYPE_CHECKING:
    from langchain_mongodb.retrievers import MongoDBAtlasHybridSearchRetriever
    from langchain_text_splitters import TextSplitter as LangChainTextSplitter


class LongTermMemoryCreator:
    """Rebuild the mentors' long-term memory: extract, chunk, embed, index.

    Dependencies are injected so each can be swapped or faked; use
    :meth:`build` for the configured defaults.

    Args:
        retriever: Hybrid retriever whose vector store receives the chunks.
        splitter: Splits extracted documents into chunks.
        extractor: Yields ``(mentor, documents)`` for every mentor.
        deduplicator: Drops near-duplicate chunks before embedding.
    """

    def __init__(
        self,
        retriever: MongoDBAtlasHybridSearchRetriever,
        splitter: LangChainTextSplitter,
        extractor: Extractor,
        deduplicator: DeduplicateDocuments,
    ) -> None:
        self.retriever = retriever
        self.splitter = splitter
        self.extractor = extractor
        self.deduplicator = deduplicator

    @classmethod
    def build(cls) -> LongTermMemoryCreator:
        """Create an instance wired from settings."""
        retriever = Retriever(
            embedding_model_id=settings.rag.TEXT_EMBEDDING_MODEL_ID,
            k=settings.rag.TOP_K,
        ).get_hybrid_search_mongodb_retriever()
        splitter = TextSplitter(chunk_size=settings.rag.CHUNK_SIZE).get_splitter()
        return cls(retriever, splitter, Extractor(), DeduplicateDocuments())

    def __call__(self) -> int:
        """Replace the long-term memory with freshly extracted documents.

        The collection is emptied first, so retrieval returns nothing until
        ingestion finishes; run this as an offline job, not while serving.

        Returns:
            The number of chunks ingested.
        """
        collection = self.retriever.vectorstore.collection
        deleted = collection.delete_many({}).deleted_count
        logger.info("Cleared long-term memory ({} documents)", deleted)

        total = 0
        for mentor, docs in self.extractor.get_extraction_generator():
            chunks = self.deduplicator.remove_duplicates(self.splitter.split_documents(docs))
            if not chunks:
                logger.warning("No chunks to ingest for {}", mentor.id)
                continue
            self.retriever.vectorstore.add_documents(chunks)
            total += len(chunks)
            logger.info("Ingested {} chunks for {}", len(chunks), mentor.id)

        create_search_indexes(self.retriever, embedding_dim=settings.rag.TEXT_EMBEDDING_MODEL_DIM)
        logger.info("Long-term memory rebuilt with {} chunks", total)
        return total
