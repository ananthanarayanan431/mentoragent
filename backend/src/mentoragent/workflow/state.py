"""Graph state."""

from __future__ import annotations

from langgraph.graph import MessagesState


class MentorState(MessagesState):
    """State of one conversation with a mentor.

    ``messages`` (from :class:`MessagesState`) is merged with ``add_messages``:
    nodes return only new messages, or ``RemoveMessage`` markers.

    Attributes:
        mentor_id: Id of the mentor; scopes retrieval to their sources.
        mentor_name: Name of the mentor.
        mentor_expertise: Expertise of the mentor.
        mentor_perspective: Perspective of the mentor.
        mentor_style: Talking style of the mentor.
        mentor_context: Optional extra context injected into the system prompt.
        summary: Running summary of messages trimmed from the history.
    """

    mentor_id: str
    mentor_name: str
    mentor_expertise: str
    mentor_perspective: str
    mentor_style: str
    mentor_context: str
    summary: str


def state_to_str(state: MentorState) -> str:
    """Render the state compactly, e.g. as evaluation context."""
    if state.get("summary"):
        conversation: object = state["summary"]
    elif state.get("messages"):
        conversation = state["messages"]
    else:
        conversation = ""

    return (
        f"MentorState(mentor_context={state.get('mentor_context', '')}, "
        f"mentor_name={state.get('mentor_name')}, "
        f"mentor_expertise={state.get('mentor_expertise')}, "
        f"mentor_perspective={state.get('mentor_perspective')}, "
        f"mentor_style={state.get('mentor_style')}, "
        f"conversation={conversation})"
    )
