"""Extractors that turn a mentor's knowledge sources into documents."""

from __future__ import annotations

from mentoragent.rag.extractors.base import DocumentExtractor, Source, make_document
from mentoragent.rag.extractors.extract_pdf_contents import extract_pdf_contents
from mentoragent.rag.extractors.extract_twitter_tweets import extract_twitter_tweets
from mentoragent.rag.extractors.extract_wikipedia import extract_wikipedia
from mentoragent.rag.extractors.extract_youtube_transcripts import extract_youtube_transcripts

__all__ = [
    "DocumentExtractor",
    "Source",
    "extract_pdf_contents",
    "extract_twitter_tweets",
    "extract_wikipedia",
    "extract_youtube_transcripts",
    "make_document",
]
