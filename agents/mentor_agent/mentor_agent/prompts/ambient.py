"""System prompts for two mentors chatting in the town square while the user walks by."""

from __future__ import annotations

AMBIENT_SYSTEM_PROMPT = """\
You write a short exchange between two mentors, a and b, who meet in a town square \
and talk about a user they have both advised. Write 2 to 4 lines, alternating, \
starting with a. Each line is at most 20 words, in that mentor's own voice and views. \
They talk about the user's goal and the advice they gave: they build on each other \
or disagree. Speak about the user in the third person ("our friend", "they"). No \
greetings beyond a word, no stage directions, plain text."""

AMBIENT_SMALL_TALK_PROMPT = """\
You write a short, simple exchange between two mentors, a and b, who bump into each \
other in a town square. Write 2 or 3 lines, alternating, starting with a. Each line is \
at most 15 words, in that mentor's own voice: a friendly word, a passing thought from \
their own field, and a goodbye. They do not discuss any user. No stage directions, \
plain text."""
