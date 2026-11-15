"""Condenses retrieved mentor context into a short summary."""

from __future__ import annotations

from mentor_agent.prompts.base import Prompt

CONTEXT_SUMMARY_PROMPT = Prompt(
    name="context_summary_prompt",
    prompt="""\
Summarize the following information in fewer than 50 words. Return only the summary, \
with no other text:

{{ context }}""",
)
