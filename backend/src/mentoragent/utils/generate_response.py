from typing import Any, Union, AsyncGenerator
from mentoragents.workflow.state import MentorState
from mentoragents.workflow.graph import MentorGraph
from langgraph.checkpoint.mongodb.aio import AsyncMongoDBSaver
from langchain_core.messages import AIMessageChunk, AIMessage, HumanMessage
from loguru import logger
from mentoragents.core.config import settings
from opik.integrations.langchain import OpikTracer
import uuid
import traceback

async def get_response(
    graph_builder : MentorGraph,
    messages : str | list[str] | list[dict[str, Any]],
    mentor_id : str,
    mentor_name : str,
    mentor_expertise : str,
    mentor_perspective : str,
    mentor_style : str,
    mentor_context : str, 
    new_thread : bool = False,
) -> tuple[str, MentorState]:
    """
    Runs the conversation through the workflow graph.

    Args:
        graph_builder : The graph builder to use.
        messages : Initial message to start the conversation.
        mentor_id : Unique identifier for the mentor.
        mentor_name : Name of the mentor.
        mentor_expertise : Expertise of the mentor.
        mentor_perspective : Perspective of the mentor. 
        mentor_style : Style of the mentor.
        mentor_context : Additional context about the mentor. 
        new_thread : Whether to start a new thread.

    Returns:
        tuple[str, MentorState]: A tuple containing:
            - The context of the last message in the conversation.
            - The final state after running the workflow. 
    
    Raises:
        RuntimeError : If there's an error running the conversation workflow. 
    """
    try:
        async with AsyncMongoDBSaver.from_conn_string(
            conn_string = settings.MONGO_URI, 
            db_name = settings.MONGO_DB_NAME,
            checkpoint_collection_name = settings.MONGO_STATE_CHECKPOINT_COLLECTION,
            writes_collection_name = settings.MONGO_STATE_WRITES_COLLECTION
        ) as checkpointer:
            logger.info("get_response called...")
            graph = graph_builder.compile(checkpointer = checkpointer)
            opik_tracer = OpikTracer(
                graph = graph.get_graph(xray = True)
            )

            thread_id = (
                mentor_id if new_thread else f"{mentor_id}-{uuid.uuid4()}"
            )

            config = {
                "configurable" : { "thread_id" : thread_id },
                "call_backs" : [opik_tracer]
            }

            output_state = await graph.ainvoke(
                input = {
                    "messages" : __format_messages(messages=messages),
                    "mentor_name" : mentor_name,
                    "mentor_expertise" : mentor_expertise,
                    "mentor_perspective" : mentor_perspective,
                    "mentor_style" : mentor_style,
                    "mentor_context" : mentor_context
                },
                config = config
            )
            logger.info("get_response completed...")
            last_message = output_state["messages"][-1]
            return last_message.content, MentorState(**output_state)
    except Exception as e:
        raise RuntimeError(f"Error running conversation workflow: {str(e)} ; {traceback.format_exc()}") from e 
    

async def get_streaming_response(
    graph_builder : MentorGraph,
    messages : str | list[str] | list[dict[str, Any]],
    mentor_id : str,
    mentor_name : str,
    mentor_expertise : str, 
    mentor_perspective : str,
    mentor_style : str,
    mentor_context : str,
    new_thread : bool = False
) -> AsyncGenerator[str, None]:
    """
    Runs the conversation through the workflow graph with streaming response. 

    Args:
        graph_builder : The graph builder to use.
        messages : Initial message to start the conversation. 
        mentor_id : Unique identifier for the mentor.
        mentor_name : Name of the mentor.
        mentor_expertise : Expertise of the mentor.
        mentor_perspective : Perspective of the mentor. 
        mentor_style : Style of the mentor.
        mentor_context : Additional context about the mentor. 

    Returns:
        tuple[str, MentorState] : A tuple containing:
            - The context of the last message in the conversation.
            - The final state after running the workflow. 
    
    Raises:
        RuntimeError : If there's an error running the conversation workflow. 
    """
    try:
        async with AsyncMongoDBSaver.from_conn_string(
            conn_string = settings.MONGO_URI,
            db_name = settings.MONGO_DB_NAME,
            checkpoint_collection_name = settings.MONGO_STATE_CHECKPOINT_COLLECTION,
            writes_collection_name = settings.MONGO_STATE_WRITES_COLLECTION
        ) as checkpointer:
            logger.info("get_streaming_response called...")
            graph = graph_builder.compile(checkpointer = checkpointer)
            opik_tracer = OpikTracer(
                graph = graph.get_graph(xray = True)
            )

            thread_id = (
                mentor_id if new_thread else f"{mentor_id}-{uuid.uuid4()}"
            )

            config = {
                "configurable" : { "thread_id" : thread_id },
                "call_backs" : [opik_tracer]
            }

            async for chunk in graph.astream(
                input = {
                    "messages" : __format_messages(messages = messages),
                    "mentor_name" : mentor_name,
                    "mentor_expertise" : mentor_expertise,
                    "mentor_perspective" : mentor_perspective,
                    "mentor_style" : mentor_style,
                    "mentor_context" : mentor_context
                },
                config = config,
                stream_mode = "values"
            ):
                if chunk[1]["langgraph_node"] == "conversation_node" and isinstance(chunk[0], AIMessageChunk):
                    yield chunk[0].content
            logger.info("get_streaming_response completed...")

    except Exception as e:
        raise RuntimeError(f"Error running conversation workflow: {str(e)} ; {traceback.format_exc()}") from e 
    
def __format_messages(messages : str | list[str] | list[dict[str, Any]]) -> list[Union[HumanMessage, AIMessage]]:
    """
    Convert various message formats to a list of LangChain message objects.

    Args: 
        messages : Can be one of :
            - A single string messages
            - A list of strings
            - A list of dictionaries with "role" and "content" keys

    Returns:
        list[Union[HumanMessage, AIMessage]] : A list of LangChain message objects.
    """

    if isinstance(messages, str):
        return [HumanMessage(content = messages)]

    if isinstance(messages, list):
        if not messages:
            return []
        
        if (
            isinstance(messages[0], dict) 
            and "role" in messages[0]
            and "content" in messages[0]
        ):
            result = []
            for msg in messages:
                if msg['role'] == 'user':
                    result.append(HumanMessage(content=msg['content']))
                else:
                    result.append(AIMessage(content=msg['content']))
            return result
        
        return [HumanMessage(content=msg) for msg in messages]
    return []