"""What a mentor is asked when the user walks up to them with news from the others."""

from __future__ import annotations

from mentor_agent.prompts.base import Prompt

OPENER_INSTRUCTION = Prompt(
    name="opener_instruction",
    prompt="""\
(The user has just walked up to you. Speak first: in one or two short sentences, react \
to what another mentor told them, in your own voice. Agree, add to it or push back. Do \
not introduce yourself at length and do not ask how you can help.)""",
)
