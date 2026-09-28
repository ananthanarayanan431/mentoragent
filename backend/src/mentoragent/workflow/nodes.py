"""Graph nodes. Each returns a partial state update and never mutates ``state``."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.messages import HumanMessage, RemoveMessage, ToolMessage
from loguru import logger

if TYPE_CHECKING:
    from collections.abc import Sequence

    from langchain_core.messages import BaseMessage
    from langchain_core.runnables import RunnableConfig

    from mentoragent.workflow.chains import Chains
    from mentoragent.workflow.state import MentorState

StateUpdate = dict[str, Any]


def messages_to_remove(messages: Sequence[BaseMessage], keep_last: int) -> list[BaseMessage]:
    """Return the messages to drop so that about ``keep_last`` remain.

    The kept tail always starts at a user message: cutting between an AI
    tool call and its tool result would leave an orphaned ``ToolMessage``,
    which chat APIs reject.
    """
    cut = max(len(messages) - keep_last, 0)
    while cut < len(messages) and not isinstance(messages[cut], HumanMessage):
        cut += 1
    if cut >= len(messages):
        return []
    return list(messages[:cut])


class Nodes:
    """Node implementations, bound to the chains they run.

    Args:
        chains: The prompt -> model chains.
        messages_after_summary: Messages kept verbatim after a summary.
    """

    def __init__(self, chains: Chains, messages_after_summary: int) -> None:
        self.chains = chains
        self.messages_after_summary = messages_after_summary

    async def conversation_node(self, state: MentorState, config: RunnableConfig) -> StateUpdate:
        """Let the mentor answer, or request a tool call."""
        response = await self.chains.mentor_response.ainvoke(
            {
                "messages": state["messages"],
                "summary": state.get("summary", ""),
                "mentor_name": state["mentor_name"],
                "mentor_expertise": state["mentor_expertise"],
                "mentor_perspective": state["mentor_perspective"],
                "mentor_style": state["mentor_style"],
                "mentor_context": state.get("mentor_context", ""),
            },
            config,
        )
        return {"messages": [response]}

    async def summarize_context_node(
        self, state: MentorState, config: RunnableConfig
    ) -> StateUpdate:
        """Condense the tool results just returned, to keep the prompt small.

        Messages are returned with their original ids, so ``add_messages``
        replaces them in place.
        """
        updated: list[BaseMessage] = []
        for message in reversed(state["messages"]):
            if not isinstance(message, ToolMessage):
                break
            summary = await self.chains.summarize_context.ainvoke(
                {"context": message.content}, config
            )
            updated.append(message.model_copy(update={"content": summary.content}))
        return {"messages": updated}

    async def summarize_conversation_node(
        self, state: MentorState, config: RunnableConfig
    ) -> StateUpdate:
        """Fold older messages into ``summary`` and drop them from the history."""
        summary = state.get("summary", "")
        chain = (
            self.chains.extend_conversation_summary
            if summary
            else self.chains.summarize_conversation
        )
        response = await chain.ainvoke(
            {
                "messages": state["messages"],
                "mentor_name": state["mentor_name"],
                "summary": summary,
            },
            config,
        )

        to_remove = messages_to_remove(state["messages"], self.messages_after_summary)
        logger.debug("Summarised conversation; dropping {} messages", len(to_remove))
        return {
            "summary": response.content,
            "messages": [RemoveMessage(id=m.id) for m in to_remove if m.id],
        }
