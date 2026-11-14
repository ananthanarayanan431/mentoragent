"""Extractors that turn a mentor's knowledge sources into documents."""

from __future__ import annotations

from mentor_agent.rag.extractors.base import DocumentExtractor, Source, make_document
from mentor_agent.rag.extractors.extract_notes import extract_notes
from mentor_agent.rag.extractors.extract_pdf_contents import extract_pdf_contents
from mentor_agent.rag.extractors.extract_twitter_tweets import extract_twitter_tweets
from mentor_agent.rag.extractors.extract_websites import extract_websites
from mentor_agent.rag.extractors.extract_wikipedia import extract_wikipedia
from mentor_agent.rag.extractors.extract_youtube_transcripts import extract_youtube_transcripts

__all__ = [
    "DocumentExtractor",
    "Source",
    "extract_notes",
    "extract_pdf_contents",
    "extract_twitter_tweets",
    "extract_websites",
    "extract_wikipedia",
    "extract_youtube_transcripts",
    "make_document",
]
