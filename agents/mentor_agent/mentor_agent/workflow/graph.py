"""The mentor conversation graph.

START -> conversation --(tool call)--> retrieve_context -> summarize_context
             ^                                                   |
             +---------------------------------------------------+
conversation --(long history)--> summarize_conversation -> END
conversation --(otherwise)--> END
"""

from __future__ import annotations

from functools import partial
from typing import TYPE_CHECKING, Any, TypeAlias

from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from mentor_agent.workflow.edges import (
    CONVERSATION_NODE,
    RETRIEVE_CONTEXT_NODE,
    SUMMARIZE_CONTEXT_NODE,
    SUMMARIZE_CONVERSATION_NODE,
    route_after_conversation,
)
from mentor_agent.workflow.state import MentorState

if TYPE_CHECKING:
    from collections.abc import Sequence

    from langchain_core.tools import BaseTool
    from langgraph.checkpoint.base import BaseCheckpointSaver
    from langgraph.graph.state import CompiledStateGraph

    from mentor_agent.workflow.nodes import Nodes

    MentorGraphBuilder: TypeAlias = StateGraph[MentorState, None, Any, Any]
    # Input and output are partial state updates, so they stay open.
    MentorGraph: TypeAlias = CompiledStateGraph[MentorState, None, Any, Any]
    # Savers disagree on the checkpoint version type (MongoDBSaver leaves it open).
    Checkpointer: TypeAlias = BaseCheckpointSaver[Any]


def build_graph(
    nodes: Nodes, tools: Sequence[BaseTool], summary_trigger: int
) -> MentorGraphBuilder:
    """Assemble the (uncompiled) graph.

    Args:
        nodes: Node implementations.
        tools: Tools executed by the retrieve-context node.
        summary_trigger: Message count above which the history is summarised.
    """
    builder: MentorGraphBuilder = StateGraph(MentorState)

    # LangGraph's add_node and compile overloads carry unparameterised generics of
    # their own, so pyright sees them as partially unknown whatever we pass.
    add_node = builder.add_node  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
    add_node(CONVERSATION_NODE, nodes.conversation_node)
    add_node(RETRIEVE_CONTEXT_NODE, ToolNode(tools, handle_tool_errors=True))
    add_node(SUMMARIZE_CONTEXT_NODE, nodes.summarize_context_node)
    add_node(SUMMARIZE_CONVERSATION_NODE, nodes.summarize_conversation_node)

    builder.add_edge(START, CONVERSATION_NODE)
    builder.add_conditional_edges(
        CONVERSATION_NODE,
        partial(route_after_conversation, summary_trigger=summary_trigger),
        [RETRIEVE_CONTEXT_NODE, SUMMARIZE_CONVERSATION_NODE, END],
    )
    builder.add_edge(RETRIEVE_CONTEXT_NODE, SUMMARIZE_CONTEXT_NODE)
    builder.add_edge(SUMMARIZE_CONTEXT_NODE, CONVERSATION_NODE)
    builder.add_edge(SUMMARIZE_CONVERSATION_NODE, END)
    return builder


def compile_graph(
    nodes: Nodes,
    tools: Sequence[BaseTool],
    summary_trigger: int,
    checkpointer: Checkpointer | None = None,
) -> MentorGraph:
    """Build and compile the graph. Compile once per process and reuse it."""
    builder = build_graph(nodes, tools, summary_trigger)
    return builder.compile(checkpointer=checkpointer)  # pyright: ignore[reportUnknownMemberType]
