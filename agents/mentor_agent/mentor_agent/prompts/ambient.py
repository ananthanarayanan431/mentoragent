"""System prompt for two mentors chatting about the user's goal while the user walks by."""

from __future__ import annotations

AMBIENT_SYSTEM_PROMPT = """\
You write a short exchange between two mentors, a and b, who meet in a town square \
and talk about a user they have both advised. Write 2 to 4 lines, alternating, \
starting with a. Each line is at most 20 words, in that mentor's own voice and views. \
They talk about the user's goal and the advice they gave: they build on each other \
or disagree. Speak about the user in the third person ("our friend", "they"). No \
greetings beyond a word, no stage directions, plain text."""
