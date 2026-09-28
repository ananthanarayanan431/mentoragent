"""Prompt -> model chains used by the graph nodes. Built once, reused per request."""

from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from mentoragent.workflow.prompt import (
    CONTEXT_SUMMARY_PROMPT,
    EXTEND_SUMMARY_PROMPT,
    MENTOR_CHARACTER_PROMPT,
    SUMMARY_PROMPT,
    Prompt,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from langchain_core.language_models import BaseChatModel
    from langchain_core.messages import BaseMessage
    from langchain_core.runnables import Runnable
    from langchain_core.tools import BaseTool

    Chain = Runnable[dict[str, object], BaseMessage]


def _summary_chain(model: BaseChatModel, prompt: Prompt) -> Chain:
    template = ChatPromptTemplate.from_messages(
        [MessagesPlaceholder(variable_name="messages"), ("human", prompt.prompt)],
        template_format="jinja2",
    )
    return template | model


class Chains:
    """The chains the graph runs.

    Args:
        chat_model: Model that plays the mentor; must support tool calling.
        summary_model: Cheaper model for conversation and context summaries.
        tools: Tools the mentor model may call.
    """

    def __init__(
        self,
        chat_model: BaseChatModel,
        summary_model: BaseChatModel,
        tools: Sequence[BaseTool],
    ) -> None:
        mentor_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", MENTOR_CHARACTER_PROMPT.prompt),
                MessagesPlaceholder(variable_name="messages"),
            ],
            template_format="jinja2",
        )
        self.mentor_response: Chain = mentor_prompt | chat_model.bind_tools(tools)
        self.summarize_conversation: Chain = _summary_chain(summary_model, SUMMARY_PROMPT)
        self.extend_conversation_summary: Chain = _summary_chain(
            summary_model, EXTEND_SUMMARY_PROMPT
        )
        self.summarize_context: Chain = (
            ChatPromptTemplate.from_messages(
                [("human", CONTEXT_SUMMARY_PROMPT.prompt)], template_format="jinja2"
            )
            | summary_model
        )
