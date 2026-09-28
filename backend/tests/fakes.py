"""Test doubles for the LLM, retriever and mentor catalogue."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from langchain_core.documents import Document
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_core.retrievers import BaseRetriever
from langgraph.checkpoint.memory import InMemorySaver
from pydantic import PrivateAttr

from mentoragent.core.exceptions import MentorNotFoundException
from mentoragent.services.conversation import ConversationService
from mentoragent.workflow.chains import Chains
from mentoragent.workflow.graph import compile_graph
from mentoragent.workflow.nodes import Nodes
from mentoragent.workflow.tools import build_retrieve_context_tool

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence

    from langchain_core.callbacks import CallbackManagerForLLMRun, CallbackManagerForRetrieverRun
    from langchain_core.messages import BaseMessage

    from mentoragent.models.mentor_extract import MentorExtract


class ScriptedChatModel(BaseChatModel):
    """Replies with ``responses`` in order (cycling), in both invoke and stream mode.

    Unlike LangChain's ``GenericFakeChatModel`` it keeps tool calls when
    streaming, which the graph relies on.
    """

    responses: list[AIMessage]
    _index: int = PrivateAttr(default=0)
    _received: list[list[BaseMessage]] = PrivateAttr(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "scripted"

    @property
    def received(self) -> list[list[BaseMessage]]:
        """The prompt of every call, oldest first."""
        return self._received

    def _next(self, messages: list[BaseMessage]) -> AIMessage:
        self._received.append(messages)
        response = self.responses[self._index % len(self.responses)]
        self._index += 1
        # A fresh message per call: LangChain stamps an id onto the returned
        # object, and a reused object would make add_messages overwrite history.
        return response.model_copy(update={"id": None}, deep=True)

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self._next(messages))])

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        response = self._next(messages)
        if response.tool_calls:
            chunk = AIMessageChunk(
                content="",
                tool_call_chunks=[
                    {
                        "name": call["name"],
                        "args": json.dumps(call["args"]),
                        "id": call["id"],
                        "index": i,
                    }
                    for i, call in enumerate(response.tool_calls)
                ],
            )
            yield ChatGenerationChunk(message=chunk)
            return
        words = str(response.content).split(" ")
        for i, word in enumerate(words):
            token = word if i == len(words) - 1 else f"{word} "
            if run_manager:
                run_manager.on_llm_new_token(token)
            yield ChatGenerationChunk(message=AIMessageChunk(content=token))

    def bind_tools(self, tools: Sequence[Any], **kwargs: Any) -> ScriptedChatModel:  # type: ignore[override]
        return self


class RecordingRetriever(BaseRetriever):
    """Returns fixed documents and records the (mentor_id, query) of each call."""

    mentor_id: str
    documents: list[Document]
    # Any: a list-typed field would be copied on validation, losing the shared log.
    calls: Any

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> list[Document]:
        self.calls.append((self.mentor_id, query))
        return self.documents


def tool_call(query: str, call_id: str = "call_1") -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[{"name": "retrieve_mentor_context", "args": {"query": query}, "id": call_id}],
    )


def build_fake_conversation_service(
    chat_responses: list[AIMessage],
    *,
    summary_text: str = "short summary",
    documents: list[Document] | None = None,
    summary_trigger: int = 30,
    messages_after_summary: int = 5,
) -> tuple[ConversationService, ScriptedChatModel, list[tuple[str, str]]]:
    """A real graph and service, wired to scripted models and an in-memory checkpointer.

    Returns:
        The service, the mentor chat model, and the retriever call log.
    """
    calls: list[tuple[str, str]] = []
    docs = (
        documents
        if documents is not None
        else [Document(page_content="Buy wonderful businesses.", metadata={"source": "wikipedia"})]
    )
    tools = [
        build_retrieve_context_tool(
            lambda mentor_id: RecordingRetriever(mentor_id=mentor_id, documents=docs, calls=calls)
        )
    ]
    chat_model = ScriptedChatModel(responses=chat_responses)
    summary_model = ScriptedChatModel(responses=[AIMessage(content=summary_text)])
    nodes = Nodes(Chains(chat_model, summary_model, tools), messages_after_summary)
    graph = compile_graph(nodes, tools, summary_trigger, checkpointer=InMemorySaver())
    return ConversationService(graph, recursion_limit=12), chat_model, calls


class InMemoryMentorService:
    """Mentor catalogue backed by a dict."""

    def __init__(self, mentors: list[MentorExtract]) -> None:
        self.mentors = {m.id: m for m in mentors}

    async def list_mentors(self) -> list[MentorExtract]:
        return sorted(self.mentors.values(), key=lambda m: m.name)

    async def get_mentor(self, mentor_id: str) -> MentorExtract:
        try:
            return self.mentors[mentor_id]
        except KeyError:
            raise MentorNotFoundException(mentor_id) from None
