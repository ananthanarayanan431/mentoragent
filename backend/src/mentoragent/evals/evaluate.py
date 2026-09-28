import opik
from mentoragent.core.config import settings
from loguru import logger
from opik.evaluation import evaluate
from opik.evaluation.metrics import (Hallucination, AnswerRelevance, Moderation, ContextRecall, ContextPrecision)
from mentoragent.workflow.state import state_to_str
from mentoragent.workflow.graph import MentorGraph
from mentoragent.utils.generate_response import get_response
from mentoragent.db.client import MongoClientWrapper
from mentoragent.models.mentor_extract import MentorExtract
import asyncio

graph_builder = MentorGraph().build()

mentors_collection = MongoClientWrapper(
    model = MentorExtract,
    collection_name = settings.mongo.MENTORS_COLLECTION,
    database_name = settings.mongo.DB_NAME,
    mongodb_uri = settings.mongo.URI
)


scoring_metrics = [
    Hallucination(),
    AnswerRelevance(),
    Moderation(),
    ContextRecall(),
    ContextPrecision(),
]

def evaluate_agent(
    dataset : opik.Dataset | None = None,
    workers : int = 2,
    nb_samples : int | None = None 
) -> None: 
    """
    Evaluates an agents using a specified metrics and dataset.

    Runs evaluation using opik framework with configured metrics for hallucination, answer relevance, moderation, and context recall.
    
    Args:
        dataset : the dataset to evaluate, 
        workers : number of workers to use for evaluation, 
        nb_samples : number of samples to evaluate, 
    """
    if not dataset:
        raise ValueError("Dataset is None. We need a dataset to evaluate the agent.")
    
    logger.info("Starting evaluation...")

    experiment_config = {
        "model_id" : settings.groq.LLM_MODEL,
        "dataset_name" : dataset.name,
    }

    used_prompts = get_used_prompts()

    logger.info("Evaluation details...")
    logger.info(f"Dataset : {dataset.name}")
    logger.info(f"Metrics: {[m.__class__.__name__ for m in scoring_metrics]}")

    evaluate(
        dataset=dataset,
        task=lambda x: asyncio.run(evaluation_task(x)),
        scoring_metrics=scoring_metrics,
        experiment_config=experiment_config,
        task_threads=workers,
        nb_samples=nb_samples,
        prompts=used_prompts,
    )

    logger.info("Evaluation completed successfully.")


def get_used_prompts() -> list[str]:
    """
    Gets the used prompts for the evaluation.
    """
    client = opik.Opik()
    prompts = [
        client.get_prompt(name="mentor_character_prompt"),
        client.get_prompt(name="summary_prompt"),
        client.get_prompt(name="extend_summary_prompt"),
    ]   

    pmts = [p for p in prompts if p is not None]
    return pmts


async def evaluation_task(x : dict) -> dict:
    """
    Calls agentic app logic to evaluate the philosopher response.

    Args:
        x : Dictionary containing the evaluation data with the following keys:
            message : List of conversation message where all but the last are inputs and the last is the expected output.
            mentor_id : ID of the mentor to use. 

    Returns:
        dict : Dictionary with evaluation results containing:
            input : Original input message.
            context : Context used for generating the response.
            output : Generated response from the agent. 
            expected_output : Expected answer for comparison.
    """

    # mentor_factory = MentorFactory()
    # mentor = mentor_factory.get_financial_mentor(x["mentor_id"])
    mentor = mentors_collection.fetch_documents(query = { "id" : x["mentor_id"] }, limit = 1)[0]

    input_messages = x["messages"][:-1]
    expected_output_message = x["messages"][-1]

    logger.info(f"sending messages to agent {x['mentor_id']}...")
    response, latest_state = await get_response(
        graph_builder = graph_builder,
        messages = input_messages,
        mentor_id = mentor.id,
        mentor_name = mentor.name,
        mentor_expertise = mentor.expertise,
        mentor_perspective = mentor.perspective,
        mentor_style = mentor.style,
        mentor_context = "",
        new_thread = True,
    )
    logger.info(f"agent response received for {x['mentor_id']}...")
    context = state_to_str(latest_state)
    return {
        'input' : input_messages,
        'context' : context,
        'output' : response,
        'expected_output' : expected_output_message,
    }