"""Tools the mentor model can call."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from langchain_core.tools import BaseTool, tool
from langgraph.prebuilt import InjectedState
from loguru import logger

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from langchain_core.documents import Document
    from langchain_core.retrievers import BaseRetriever

RETRIEVE_CONTEXT_TOOL_NAME = "retrieve_mentor_context"
NO_CONTEXT_FOUND = "No relevant information found."


def format_documents(documents: Sequence[Document]) -> str:
    """Render retrieved documents as numbered, source-attributed passages."""
    if not documents:
        return NO_CONTEXT_FOUND
    return "\n\n".join(
        f"[{i}] ({doc.metadata.get('source', 'unknown')}) {doc.page_content}"
        for i, doc in enumerate(documents, start=1)
    )


def build_retrieve_context_tool(retriever_for_mentor: Callable[[str], BaseRetriever]) -> BaseTool:
    """Build the retrieval tool.

    The mentor id is injected from graph state rather than chosen by the
    model, so a mentor can only ever read their own sources.

    Args:
        retriever_for_mentor: Returns a retriever scoped to the given mentor id.
    """

    @tool(
        RETRIEVE_CONTEXT_TOOL_NAME,
        description=(
            "Search your own writings, talks, interviews and biography. Use it whenever "
            "the user asks about your background, work, expertise or specific views."
        ),
    )
    async def retrieve_mentor_context(
        query: str, mentor_id: Annotated[str, InjectedState("mentor_id")]
    ) -> str:
        """Search the mentor's long-term memory for ``query``."""
        documents = await retriever_for_mentor(mentor_id).ainvoke(query)
        logger.debug("Retrieved {} documents for mentor {}", len(documents), mentor_id)
        return format_documents(documents)

    return retrieve_mentor_context
