"""The mentor conversation graph.

START -> conversation --(tool call)--> retrieve_context -> summarize_context
             ^                                                   |
             +---------------------------------------------------+
conversation --(long history)--> summarize_conversation -> END
conversation --(otherwise)--> END
"""

from __future__ import annotations

from functools import partial
from typing import TYPE_CHECKING

from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from mentoragent.workflow.edges import (
    CONVERSATION_NODE,
    RETRIEVE_CONTEXT_NODE,
    SUMMARIZE_CONTEXT_NODE,
    SUMMARIZE_CONVERSATION_NODE,
    route_after_conversation,
)
from mentoragent.workflow.state import MentorState

if TYPE_CHECKING:
    from collections.abc import Sequence

    from langchain_core.tools import BaseTool
    from langgraph.checkpoint.base import BaseCheckpointSaver
    from langgraph.graph.state import CompiledStateGraph

    from mentoragent.workflow.nodes import Nodes


def build_graph(nodes: Nodes, tools: Sequence[BaseTool], summary_trigger: int) -> StateGraph:
    """Assemble the (uncompiled) graph.

    Args:
        nodes: Node implementations.
        tools: Tools executed by the retrieve-context node.
        summary_trigger: Message count above which the history is summarised.
    """
    builder = StateGraph(MentorState)

    builder.add_node(CONVERSATION_NODE, nodes.conversation_node)
    builder.add_node(RETRIEVE_CONTEXT_NODE, ToolNode(tools, handle_tool_errors=True))
    builder.add_node(SUMMARIZE_CONTEXT_NODE, nodes.summarize_context_node)
    builder.add_node(SUMMARIZE_CONVERSATION_NODE, nodes.summarize_conversation_node)

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
    checkpointer: BaseCheckpointSaver | None = None,
) -> CompiledStateGraph:
    """Build and compile the graph. Compile once per process and reuse it."""
    return build_graph(nodes, tools, summary_trigger).compile(checkpointer=checkpointer)
