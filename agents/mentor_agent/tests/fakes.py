"""Test doubles for the LLM, retriever and mentor catalogue."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from langchain_core.documents import Document
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_core.retrievers import BaseRetriever
from langgraph.checkpoint.memory import InMemorySaver
from pydantic import PrivateAttr

from mentor_agent.chat.chains import Chains
from mentor_agent.chat.graph import compile_graph
from mentor_agent.chat.nodes import Nodes
from mentor_agent.chat.tools import build_retrieve_context_tool
from mentor_agent.errors import MemoryBuildInProgressError, MentorNotFoundError
from mentor_agent.models.mentor_extract import MentorExtract
from mentor_agent.services.conversation import ConversationService
from mentor_agent.services.custom import new_mentor_id
from mentor_agent.services.persona import Persona
from mentor_agent.services.pool import pick_new_mentor

if TYPE_CHECKING:
    import random
    from collections.abc import Collection, Iterator, Mapping, Sequence

    from langchain_core.callbacks import CallbackManagerForLLMRun, CallbackManagerForRetrieverRun

    from mentor_agent.models.mentor_extract import MemoryStatus
    from mentor_agent.services.research import ResearchFindings


class ScriptedChatModel(BaseChatModel):
    """Replies with ``responses`` in order (cycling), in both invoke and stream mode.

    Unlike LangChain's ``GenericFakeChatModel`` it keeps tool calls when
    streaming, which the graph relies on.
    """

    responses: list[AIMessage]
    _index: int = PrivateAttr(default=0)
    _received: list[list[BaseMessage]] = PrivateAttr(default_factory=list[list[BaseMessage]])

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
            raise MentorNotFoundError(mentor_id) from None

    async def ids(self) -> set[str]:
        return set(self.mentors)

    async def add_from_pool(
        self, pool: Sequence[MentorExtract], rng: random.Random
    ) -> MentorExtract:
        mentor = pick_new_mentor(pool, set(self.mentors), rng)
        self.mentors[mentor.id] = mentor
        return mentor

    async def add_custom(self, fields: Mapping[str, Any]) -> MentorExtract:
        mentor_id = new_mentor_id(str(fields["name"]), set(self.mentors))
        mentor = MentorExtract.model_validate({**fields, "id": mentor_id, "memory": "building"})
        self.mentors[mentor.id] = mentor
        return mentor

    async def update_mentor(self, mentor_id: str, changes: Mapping[str, Any]) -> MentorExtract:
        mentor = await self.get_mentor(mentor_id)
        self.mentors[mentor_id] = mentor.model_copy(update=dict(changes))
        return self.mentors[mentor_id]

    async def start_memory_build(self, mentor_id: str) -> MentorExtract:
        mentor = await self.get_mentor(mentor_id)
        if mentor.memory == "building":
            raise MemoryBuildInProgressError
        return await self.update_mentor(mentor_id, {"memory": "building"})

    async def remove_mentor(self, mentor_id: str) -> None:
        mentor = await self.get_mentor(mentor_id)
        if mentor.memory == "building":
            raise MemoryBuildInProgressError
        del self.mentors[mentor_id]

    async def set_memory_status(self, mentor_id: str, status: MemoryStatus) -> None:
        await self.update_mentor(mentor_id, {"memory": status})


class RecordingMemoryBuilder:
    """Records which mentors had a memory build or deletion requested; builds nothing."""

    def __init__(self) -> None:
        self.requested: list[str] = []
        self.forgotten: list[str] = []

    async def forget(self, mentor_id: str) -> None:
        self.forgotten.append(mentor_id)

    async def rebuild(self, mentor_id: str) -> None:
        self.requested.append(mentor_id)


class RecordingPersonaWriter:
    """Returns a fixed persona and records the names and notes it was asked about."""

    def __init__(self) -> None:
        self.requests: list[tuple[str, list[str]]] = []

    async def write(self, name: str, notes: Sequence[str]) -> Persona:
        self.requests.append((name, list(notes)))
        return Persona(expertise="Written expertise", perspective="Written view", style="Written")


class RecordingEnricher:
    """Records which custom mentors were sent for research and memory building."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, bool, list[str]]] = []

    async def enrich(self, mentor_id: str, *, research: bool, write: Collection[str]) -> None:
        self.calls.append((mentor_id, research, list(write)))


class FixedResearcher:
    """Returns the findings it was given (``None``: research failed)."""

    def __init__(self, findings: ResearchFindings | None) -> None:
        self.findings = findings
        self.researched: list[str] = []

    async def research(self, mentor: MentorExtract) -> ResearchFindings | None:
        self.researched.append(mentor.id)
        return self.findings
