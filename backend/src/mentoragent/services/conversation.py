"""Run conversations through the compiled mentor graph."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage, HumanMessage
from loguru import logger

from mentoragent.core.exceptions import ConversationError
from mentoragent.workflow.edges import CONVERSATION_NODE

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable

    from langchain_core.callbacks import BaseCallbackHandler
    from langchain_core.runnables import RunnableConfig
    from langgraph.graph.state import CompiledStateGraph

    from mentoragent.models.mentor import Mentor
    from mentoragent.workflow.state import MentorState

# Accepted message inputs: one user message, several, or role/content dicts
# (``{"role": "user" | "assistant", "content": ...}``).
MessagesInput = str | Sequence[str] | Sequence[dict[str, Any]]


@dataclass(frozen=True, slots=True)
class ChatReply:
    """The mentor's reply and the conversation state after it."""

    content: str
    state: MentorState


def to_langchain_messages(messages: MessagesInput) -> list[BaseMessage]:
    """Normalise the accepted message inputs to LangChain messages."""
    if isinstance(messages, str):
        return [HumanMessage(content=messages)]

    result: list[BaseMessage] = []
    for message in messages:
        if isinstance(message, str):
            result.append(HumanMessage(content=message))
        elif message.get("role") == "user":
            result.append(HumanMessage(content=message["content"]))
        else:
            result.append(AIMessage(content=message["content"]))
    return result


def thread_id_for(mentor_id: str, conversation_id: str) -> str:
    """Checkpointer thread id: one thread per (mentor, conversation) pair."""
    return f"{mentor_id}:{conversation_id}"


class ConversationService:
    """Chat with mentors; history is persisted per conversation by the checkpointer.

    Args:
        graph: The compiled graph (with a checkpointer).
        recursion_limit: Maximum graph steps per turn.
        tracer_factory: Optional ``thread_id -> callback`` factory for tracing
            (e.g. Opik).
    """

    def __init__(
        self,
        graph: CompiledStateGraph,
        recursion_limit: int,
        tracer_factory: Callable[[str], BaseCallbackHandler] | None = None,
    ) -> None:
        self.graph = graph
        self.recursion_limit = recursion_limit
        self.tracer_factory = tracer_factory

    def _config(self, thread_id: str) -> RunnableConfig:
        callbacks = [self.tracer_factory(thread_id)] if self.tracer_factory else []
        return {
            "configurable": {"thread_id": thread_id},
            "callbacks": callbacks,
            "recursion_limit": self.recursion_limit,
        }

    @staticmethod
    def _input(mentor: Mentor, messages: MessagesInput, mentor_context: str) -> dict[str, Any]:
        return {
            "messages": to_langchain_messages(messages),
            "mentor_id": mentor.id,
            "mentor_name": mentor.mentor_name,
            "mentor_expertise": mentor.mentor_expertise,
            "mentor_perspective": mentor.mentor_perspective,
            "mentor_style": mentor.mentor_style,
            "mentor_context": mentor_context,
        }

    async def respond(
        self,
        mentor: Mentor,
        messages: MessagesInput,
        conversation_id: str,
        mentor_context: str = "",
    ) -> ChatReply:
        """Send ``messages`` and return the mentor's full reply.

        Raises:
            ConversationError: If the graph fails (LLM, retrieval, DB).
        """
        thread_id = thread_id_for(mentor.id, conversation_id)
        try:
            state = await self.graph.ainvoke(
                self._input(mentor, messages, mentor_context), self._config(thread_id)
            )
        except Exception as exc:
            logger.opt(exception=exc).error("Conversation {} failed", thread_id)
            raise ConversationError from exc

        return ChatReply(content=_text(state["messages"][-1]), state=cast("MentorState", state))

    async def stream(
        self,
        mentor: Mentor,
        messages: MessagesInput,
        conversation_id: str,
        mentor_context: str = "",
    ) -> AsyncIterator[str]:
        """Send ``messages`` and yield the mentor's reply token by token.

        Only tokens from the mentor itself are yielded - not tool calls, nor
        output of the summarisation steps.

        Raises:
            ConversationError: If the graph fails (LLM, retrieval, DB).
        """
        thread_id = thread_id_for(mentor.id, conversation_id)
        try:
            async for chunk, metadata in self.graph.astream(
                self._input(mentor, messages, mentor_context),
                self._config(thread_id),
                stream_mode="messages",
            ):
                metadata = cast("dict[str, Any]", metadata)
                if (
                    metadata.get("langgraph_node") == CONVERSATION_NODE
                    and isinstance(chunk, AIMessageChunk)
                    and chunk.content
                ):
                    yield _text(chunk)
        except Exception as exc:
            logger.opt(exception=exc).error("Streaming conversation {} failed", thread_id)
            raise ConversationError from exc

    async def delete_conversation(self, mentor_id: str, conversation_id: str) -> None:
        """Forget one conversation's history."""
        checkpointer = self.graph.checkpointer
        if checkpointer is not None and not isinstance(checkpointer, bool):
            await checkpointer.adelete_thread(thread_id_for(mentor_id, conversation_id))


def _text(message: BaseMessage) -> str:
    """Plain text of a message whose content may be a list of content blocks."""
    content = message.content
    if isinstance(content, str):
        return content
    return "".join(
        block if isinstance(block, str) else str(block.get("text", "")) for block in content
    )
