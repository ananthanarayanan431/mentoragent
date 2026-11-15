"""System prompt that turns one exchange into a line in the advice ledger."""

from __future__ import annotations

LEDGER_SYSTEM_PROMPT = """\
You keep a ledger of the advice mentors give a user. Given the user's message and \
the mentor's reply, write:
- topic: what the advice is about, at most 4 words.
- advice: the advice itself in one sentence of at most 25 words, in the third \
person ("Recommends ...", "Warns against ...").
If the reply gives no concrete advice (a greeting, small talk, a question back), \
return null for both."""
