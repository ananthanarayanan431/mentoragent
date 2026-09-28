from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import TYPE_CHECKING, Any

import opik
from loguru import logger
from opik.evaluation import evaluate
from opik.evaluation.metrics import (
    AnswerRelevance,
    ContextPrecision,
    ContextRecall,
    Hallucination,
    Moderation,
)

from mentoragent.core.config import settings
from mentoragent.core.exceptions import MentorNotFoundException
from mentoragent.db.client import MongoRepository
from mentoragent.models.mentor_extract import MentorExtract
from mentoragent.utils.generate_response import get_response
from mentoragent.workflow.graph import MentorGraph
from mentoragent.workflow.state import state_to_str

if TYPE_CHECKING:
    from opik.api_objects.prompt.base_prompt import BasePrompt

USED_PROMPT_NAMES = ("mentor_character_prompt", "summary_prompt", "extend_summary_prompt")


# Built on first use rather than at import, so importing this module neither
# compiles the graph nor opens a database connection.
@lru_cache(maxsize=1)
def _graph_builder() -> Any:
    return MentorGraph().build()


@lru_cache(maxsize=1)
def _mentors() -> MongoRepository[MentorExtract]:
    return MongoRepository(model=MentorExtract, collection_name=settings.mongo.MENTORS_COLLECTION)


def _scoring_metrics() -> list[Any]:
    # Opik judges through LiteLLM; the "openrouter/" prefix routes them to OpenRouter,
    # which reads OPENROUTER_API_KEY from the environment (exported by load_dotenv).
    judge = f"openrouter/{settings.openrouter.LLM_MODEL}"
    return [
        Hallucination(model=judge),
        AnswerRelevance(model=judge),
        Moderation(model=judge),
        ContextRecall(model=judge),
        ContextPrecision(model=judge),
    ]


def evaluate_agent(dataset: opik.Dataset, workers: int = 2, nb_samples: int | None = None) -> None:
    """Score the agent on ``dataset`` with Opik.

    Metrics: hallucination, answer relevance, moderation, context recall and
    context precision.

    Args:
        dataset: The Opik dataset to evaluate on.
        workers: Number of samples evaluated concurrently.
        nb_samples: Evaluate only the first ``nb_samples``; ``None`` for all.
    """
    scoring_metrics = _scoring_metrics()
    logger.info(
        "Starting evaluation on dataset {} with metrics {}",
        dataset.name,
        [type(m).__name__ for m in scoring_metrics],
    )

    evaluate(
        dataset=dataset,
        task=lambda sample: asyncio.run(evaluation_task(sample)),
        scoring_metrics=scoring_metrics,
        experiment_config={"model_id": settings.groq.LLM_MODEL, "dataset_name": dataset.name},
        task_threads=workers,
        nb_samples=nb_samples,
        prompts=get_used_prompts(),
    )

    logger.info("Evaluation completed")


def get_used_prompts() -> list[BasePrompt]:
    """Return the Opik prompts the agent uses, skipping any not registered."""
    client = opik.Opik()
    prompts = (client.get_prompt(name=name) for name in USED_PROMPT_NAMES)
    return [p for p in prompts if p is not None]


async def evaluation_task(sample: dict[str, Any]) -> dict[str, Any]:
    """Run the agent on one dataset sample.

    Args:
        sample: Must contain ``mentor_id`` and ``messages``; every message but
            the last is sent to the agent, the last is the expected answer.

    Returns:
        ``input``, ``context``, ``output`` and ``expected_output`` for scoring.

    Raises:
        MentorNotFoundException: If ``mentor_id`` is not in the database.
    """
    mentor_id = sample["mentor_id"]
    mentor = _mentors().fetch_one({"id": mentor_id})
    if mentor is None:
        raise MentorNotFoundException(mentor_id)

    input_messages = sample["messages"][:-1]
    expected_output_message = sample["messages"][-1]

    logger.info("Sending messages to agent {}", mentor_id)
    response, latest_state = await get_response(
        graph_builder=_graph_builder(),
        messages=input_messages,
        mentor_id=mentor.id,
        mentor_name=mentor.name,
        mentor_expertise=mentor.expertise,
        mentor_perspective=mentor.perspective,
        mentor_style=mentor.style,
        mentor_context="",
        new_thread=True,
    )
    logger.info("Agent response received for {}", mentor_id)

    return {
        "input": input_messages,
        "context": state_to_str(latest_state),
        "output": response,
        "expected_output": expected_output_message,
    }
