"""System prompt that pulls a persona and source links out of a research report."""

from __future__ import annotations

RESEARCH_EXTRACT_PROMPT = """\
Extract a mentor persona and source links from a research report about a person.
- expertise: what they know best, one line.
- perspective: the beliefs or principles they argue from, one or two sentences.
- style: how they talk and explain, one sentence.
- profile: the report's Profile section, copied faithfully.
- youtube_videos, websites, pdfs: the URLs listed in the report's YouTube, \
Writing and PDFs sections, exactly as written.
Keep each persona field under 300 characters. Use only what the report says."""
