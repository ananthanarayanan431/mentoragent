"""Summarizes a conversation for the first time."""

from __future__ import annotations

from mentor_agent.prompts.base import Prompt

SUMMARY_PROMPT = Prompt(
    name="summary_prompt",
    prompt="""\
Create a summary of the conversation above between {{ mentor_name }} and the user. The \
summary must be short, but capture every relevant piece of information shared between \
{{ mentor_name }} and the user.""",
)
