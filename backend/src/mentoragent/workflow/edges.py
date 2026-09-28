"""Conditional routing between nodes."""

from __future__ import annotations

from typing import TYPE_CHECKING, Final, Literal, cast

from langchain_core.messages import AIMessage
from langgraph.graph import END

if TYPE_CHECKING:
    from mentoragent.workflow.state import MentorState

CONVERSATION_NODE: Final = "conversation_node"
RETRIEVE_CONTEXT_NODE: Final = "retrieve_context_node"
SUMMARIZE_CONTEXT_NODE: Final = "summarize_context_node"
SUMMARIZE_CONVERSATION_NODE: Final = "summarize_conversation_node"

Route = Literal["retrieve_context_node", "summarize_conversation_node", "__end__"]


def route_after_conversation(state: MentorState, summary_trigger: int) -> Route:
    """Run requested tools; otherwise summarise long histories, or finish."""
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return RETRIEVE_CONTEXT_NODE
    if len(state["messages"]) > summary_trigger:
        return SUMMARIZE_CONVERSATION_NODE
    return cast("Route", END)
