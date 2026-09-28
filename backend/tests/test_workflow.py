"""End-to-end tests of the mentor graph with scripted models (no network)."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from mentoragent.core.exceptions import ConversationError
from mentoragent.services.conversation import thread_id_for, to_langchain_messages
from mentoragent.workflow.nodes import messages_to_remove
from mentoragent.workflow.tools import NO_CONTEXT_FOUND, format_documents
from tests.fakes import build_fake_conversation_service, tool_call

if TYPE_CHECKING:
    from mentoragent.models.mentor_extract import MentorExtract


async def test_plain_reply(mentor_extract: MentorExtract) -> None:
    service, _, calls = build_fake_conversation_service([AIMessage(content="Hello, I am Ada.")])

    reply = await service.respond(mentor_extract.to_mentor(), "Hi!", conversation_id="c1")

    assert reply.content == "Hello, I am Ada."
    assert calls == []
    assert [type(m) for m in reply.state["messages"]] == [HumanMessage, AIMessage]


async def test_tool_call_is_scoped_to_mentor_and_summarised(mentor_extract: MentorExtract) -> None:
    service, chat_model, calls = build_fake_conversation_service(
        [tool_call("your investing rules"), AIMessage(content="Grounded answer.")],
        summary_text="Condensed context.",
    )

    reply = await service.respond(mentor_extract.to_mentor(), "Rules?", conversation_id="c1")

    assert reply.content == "Grounded answer."
    # mentor_id comes from graph state, not from the model's arguments.
    assert calls == [("ada", "your investing rules")]
    tool_messages = [m for m in reply.state["messages"] if isinstance(m, ToolMessage)]
    assert [m.content for m in tool_messages] == ["Condensed context."]
    # The second model call saw the summarised tool result.
    assert any(
        isinstance(m, ToolMessage) and m.content == "Condensed context."
        for m in chat_model.received[-1]
    )


async def test_history_persists_per_conversation(mentor_extract: MentorExtract) -> None:
    service, _, _ = build_fake_conversation_service([AIMessage(content="ok")])
    mentor = mentor_extract.to_mentor()

    await service.respond(mentor, "first", conversation_id="a")
    continued = await service.respond(mentor, "second", conversation_id="a")
    fresh = await service.respond(mentor, "other", conversation_id="b")

    assert len(continued.state["messages"]) == 4
    assert len(fresh.state["messages"]) == 2


async def test_delete_conversation_forgets_history(mentor_extract: MentorExtract) -> None:
    service, _, _ = build_fake_conversation_service([AIMessage(content="ok")])
    mentor = mentor_extract.to_mentor()

    await service.respond(mentor, "first", conversation_id="a")
    await service.delete_conversation(mentor.id, "a")
    reply = await service.respond(mentor, "again", conversation_id="a")

    assert len(reply.state["messages"]) == 2


async def test_stream_yields_only_mentor_tokens(mentor_extract: MentorExtract) -> None:
    service, _, _ = build_fake_conversation_service(
        [tool_call("q"), AIMessage(content="Streamed grounded answer")],
        summary_text="SUMMARY TOKENS MUST NOT LEAK",
    )

    tokens = [
        t async for t in service.stream(mentor_extract.to_mentor(), "Hi", conversation_id="s")
    ]

    assert "".join(tokens) == "Streamed grounded answer"
    assert len(tokens) == 3


async def test_long_history_is_summarised(mentor_extract: MentorExtract) -> None:
    service, _, _ = build_fake_conversation_service(
        [AIMessage(content="reply")],
        summary_text="Earlier we talked.",
        summary_trigger=4,
        messages_after_summary=2,
    )
    mentor = mentor_extract.to_mentor()

    await service.respond(mentor, "one", conversation_id="long")
    reply = await service.respond(mentor, "two", conversation_id="long")
    reply = await service.respond(mentor, "three", conversation_id="long")

    assert reply.state["summary"] == "Earlier we talked."
    assert isinstance(reply.state["messages"][0], HumanMessage)
    assert len(reply.state["messages"]) <= 4


async def test_failures_surface_as_conversation_error(mentor_extract: MentorExtract) -> None:
    service, chat_model, _ = build_fake_conversation_service([AIMessage(content="x")])
    chat_model.responses = []  # makes the model raise ZeroDivisionError

    with pytest.raises(ConversationError):
        await service.respond(mentor_extract.to_mentor(), "Hi", conversation_id="e")


def test_messages_to_remove_never_orphans_tool_results() -> None:
    history = [
        HumanMessage("q1", id="1"),
        tool_call("x"),
        ToolMessage("ctx", tool_call_id="call_1", id="3"),
        AIMessage("a1", id="4"),
        HumanMessage("q2", id="5"),
        AIMessage("a2", id="6"),
    ]
    # keep_last=4 would start the tail at the ToolMessage; cut moves to the next user turn.
    removed = messages_to_remove(history, keep_last=4)
    assert [m.id for m in removed if m.id] == ["1", "3", "4"]
    assert messages_to_remove(history[:1], keep_last=5) == []


def test_to_langchain_messages_accepts_all_input_shapes() -> None:
    assert to_langchain_messages("hi") == [HumanMessage("hi")]
    assert to_langchain_messages(["a", "b"]) == [HumanMessage("a"), HumanMessage("b")]
    assert to_langchain_messages(
        [{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}]
    ) == [HumanMessage("q"), AIMessage("a")]


def test_thread_ids_separate_mentors_and_conversations() -> None:
    assert thread_id_for("ada", "c1") != thread_id_for("ada", "c2")
    assert thread_id_for("ada", "c1") != thread_id_for("bob", "c1")


def test_format_documents_handles_empty_results() -> None:
    assert format_documents([]) == NO_CONTEXT_FOUND
