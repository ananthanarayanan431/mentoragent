"""Extends an existing conversation summary with new messages."""

from __future__ import annotations

from mentor_agent.prompts.base import Prompt

EXTEND_SUMMARY_PROMPT = Prompt(
    name="extend_summary_prompt",
    prompt="""\
This is a summary of the conversation to date between {{ mentor_name }} and the user:

{{ summary }}

Extend the summary by taking into account the new messages above.""",
)
