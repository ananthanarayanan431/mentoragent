from __future__ import annotations

from typing import TYPE_CHECKING

from loguru import logger
from tqdm import tqdm

from mentoragent.core.config import settings
from mentoragent.db.client import MongoRepository
from mentoragent.models.mentor_extract import MentorExtract
from mentoragent.rag.extractors import (
    extract_pdf_contents,
    extract_twitter_tweets,
    extract_wikipedia,
    extract_youtube_transcripts,
)

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence

    from langchain_core.documents import Document

    from mentoragent.models.mentor import Mentor
    from mentoragent.rag.extractors import DocumentExtractor

DEFAULT_EXTRACTORS: tuple[DocumentExtractor, ...] = (
    extract_wikipedia,
    extract_twitter_tweets,
    extract_pdf_contents,
    extract_youtube_transcripts,
)


class Extractor:
    """Collect documents for every mentor from all knowledge sources.

    Args:
        mentors: Repository the mentors are read from. Defaults to the
            ``MONGO_MENTORS_COLLECTION`` collection.
        extractors: Source extractors to run, in order. Pass a subset to
            skip a source, or a fake in tests.
    """

    def __init__(
        self,
        mentors: MongoRepository[MentorExtract] | None = None,
        extractors: Sequence[DocumentExtractor] = DEFAULT_EXTRACTORS,
    ) -> None:
        self._mentors = mentors
        self.extractors = extractors

    @property
    def mentors(self) -> MongoRepository[MentorExtract]:
        # Resolved on first use so constructing an Extractor never touches the DB.
        if self._mentors is None:
            self._mentors = MongoRepository(
                model=MentorExtract, collection_name=settings.mongo.MENTORS_COLLECTION
            )
        return self._mentors

    def extract(
        self, mentor_extract: MentorExtract, sample_count: int | None = None
    ) -> list[Document]:
        """Run every extractor for one mentor.

        Args:
            mentor_extract: The mentor to extract documents for.
            sample_count: Keep at most this many documents per source;
                ``None`` keeps them all.

        Returns:
            The documents from all sources, in extractor order.
        """
        docs: list[Document] = []
        for extractor in self.extractors:
            docs.extend(extractor(mentor_extract)[:sample_count])
        logger.info("Extracted {} docs for {}", len(docs), mentor_extract.id)
        return docs

    def extract_sample_docs(
        self, mentor_extract: MentorExtract, sample_count: int = 2
    ) -> list[Document]:
        """Extract at most ``sample_count`` documents per source for one mentor."""
        return self.extract(mentor_extract, sample_count=sample_count)

    def get_extraction_generator(
        self, is_sample_data: bool = False, sample_count: int = 2
    ) -> Iterator[tuple[Mentor, list[Document]]]:
        """Yield ``(mentor, documents)`` for every mentor, one at a time.

        Args:
            is_sample_data: Keep only ``sample_count`` documents per source.
            sample_count: Documents kept per source when sampling.
        """
        mentors = self.mentors.fetch_documents(query={})
        logger.info("Fetched {} mentors", len(mentors))

        with tqdm(mentors, desc="Extracting docs", unit="mentor") as progress_bar:
            for mentor_extract in progress_bar:
                progress_bar.set_postfix({"mentor": mentor_extract.name})
                docs = self.extract(mentor_extract, sample_count if is_sample_data else None)
                yield mentor_extract.to_mentor(), docs
