"""Group conversations: the user and two mentors. What each mentor is told about
the other, on top of the shared context every mentor reads."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence


def group_context(
    other_name: str,
    *,
    ambient: Sequence[tuple[str, str]] | None = None,
    just_said: str | None = None,
    last_said: str | None = None,
) -> str:
    """What one mentor knows about the three-way conversation. Pure.

    Args:
        other_name: The other mentor in the conversation.
        ambient: ``(speaker name, line)`` of the chat the user joined, on the first turn.
        just_said: The other mentor's answer to this message (for the second speaker).
        last_said: The other mentor's previous answer (for the first speaker).
    """
    parts = [f"You are in a conversation with the user and {other_name}."]
    if ambient:
        chat = "\n".join(f"{name}: {line}" for name, line in ambient)
        parts.append(f"The user just joined while you and {other_name} were saying:\n{chat}")
    if last_said:
        parts.append(f"{other_name} said last: {last_said}")
    if just_said:
        parts.append(f"{other_name} just answered the user: {just_said}")
    parts.append(
        f"Speak to the user in your own voice, under 80 words. Never restate what "
        f"{other_name} said: if you agree, say so in a few words and add something they "
        "did not; otherwise say where you differ and why."
    )
    return "\n".join(parts)
