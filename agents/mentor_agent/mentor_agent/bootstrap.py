"""Composition root: builds the application's object graph from settings.

Everything here performs blocking I/O (connects to MongoDB, creates
indexes); async callers should run it in a worker thread.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from langgraph.checkpoint.mongodb import MongoDBSaver

from mentor_agent.core.config import settings
from mentor_agent.db.client import get_mongo_client
from mentor_agent.rag.retrievers import build_hybrid_retriever, build_vector_store
from mentor_agent.services.conversation import ConversationService
from mentor_agent.workflow.chains import Chains
from mentor_agent.workflow.graph import compile_graph
from mentor_agent.workflow.llm import build_chat_model, build_summary_model
from mentor_agent.workflow.nodes import Nodes
from mentor_agent.workflow.tools import build_retrieve_context_tool

if TYPE_CHECKING:
    from collections.abc import Callable

    from langchain_core.callbacks import BaseCallbackHandler

    from mentor_agent.workflow.graph import Checkpointer, MentorGraph


def build_checkpointer() -> MongoDBSaver:
    """Conversation short-term memory, persisted in MongoDB."""
    return MongoDBSaver(
        get_mongo_client(),
        db_name=settings.mongo.DB_NAME,
        checkpoint_collection_name=settings.mongo.STATE_CHECKPOINT_COLLECTION,
        writes_collection_name=settings.mongo.STATE_WRITES_COLLECTION,
        ttl=settings.mongo.CONVERSATION_TTL_SECONDS,
    )


def build_mentor_graph(checkpointer: Checkpointer | None = None) -> MentorGraph:
    """Build and compile the mentor graph with production models and retrieval."""
    vectorstore = build_vector_store()
    tools = [
        build_retrieve_context_tool(
            lambda mentor_id: build_hybrid_retriever(vectorstore, mentor_id=mentor_id)
        )
    ]
    chains = Chains(build_chat_model(), build_summary_model(), tools)
    nodes = Nodes(chains, messages_after_summary=settings.agent.TOTAL_MESSAGES_AFTER_SUMMARY)
    return compile_graph(
        nodes,
        tools,
        summary_trigger=settings.agent.TOTAL_MESSAGES_SUMMARY_TRIGGER,
        checkpointer=checkpointer,
    )


def _opik_tracer_factory(graph: MentorGraph) -> Callable[[str], BaseCallbackHandler]:
    from opik.integrations.langchain import OpikTracer

    graph_view = graph.get_graph(xray=True)

    def factory(thread_id: str) -> BaseCallbackHandler:
        return OpikTracer(
            graph=graph_view, thread_id=thread_id, project_name=settings.comet.PROJECT
        )

    return factory


def build_conversation_service(*, tracing: bool = False) -> ConversationService:
    """Build the conversation service with a MongoDB-backed checkpointer.

    Args:
        tracing: Attach Opik tracing to every run (requires Opik configured).
    """
    graph = build_mentor_graph(build_checkpointer())
    return ConversationService(
        graph,
        recursion_limit=settings.agent.RECURSION_LIMIT,
        tracer_factory=_opik_tracer_factory(graph) if tracing else None,
    )
