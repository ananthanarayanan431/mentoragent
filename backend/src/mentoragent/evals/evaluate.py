from __future__ import annotations

import asyncio
import threading
import uuid
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

from mentoragent.bootstrap import build_conversation_service
from mentoragent.core.config import settings
from mentoragent.core.exceptions import MentorNotFoundException
from mentoragent.db.client import MongoRepository
from mentoragent.models.mentor_extract import MentorExtract
from mentoragent.workflow.prompt import (
    EXTEND_SUMMARY_PROMPT,
    MENTOR_CHARACTER_PROMPT,
    SUMMARY_PROMPT,
)
from mentoragent.workflow.state import state_to_str

if TYPE_CHECKING:
    from collections.abc import Coroutine

    from opik.api_objects.prompt.base_prompt import BasePrompt

    from mentoragent.services.conversation import ConversationService

USED_PROMPT_NAMES = (MENTOR_CHARACTER_PROMPT.name, SUMMARY_PROMPT.name, EXTEND_SUMMARY_PROMPT.name)


class _BackgroundLoop:
    """One event loop on a daemon thread that Opik's worker threads submit to.

    LangChain's async HTTP clients are bound to the loop that first used
    them, so every evaluation task must run on the same loop rather than on
    a fresh ``asyncio.run`` per task.
    """

    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        threading.Thread(target=self.loop.run_forever, daemon=True).start()

    def run(self, coro: Coroutine[Any, Any, dict[str, Any]]) -> dict[str, Any]:
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result()

    def close(self) -> None:
        self.loop.call_soon_threadsafe(self.loop.stop)


def evaluate_agent(dataset: opik.Dataset, workers: int = 2, nb_samples: int | None = None) -> None:
    """Score the agent on ``dataset`` with Opik.

    Metrics: hallucination, answer relevance, moderation, context recall and
    context precision. Each sample runs in its own fresh conversation.

    Args:
        dataset: The Opik dataset to evaluate on.
        workers: Number of samples evaluated concurrently.
        nb_samples: Evaluate only the first ``nb_samples``; ``None`` for all.
    """
    conversations = build_conversation_service(tracing=True)
    mentors = MongoRepository(MentorExtract, settings.mongo.MENTORS_COLLECTION)
    scoring_metrics = [
        Hallucination(),
        AnswerRelevance(),
        Moderation(),
        ContextRecall(),
        ContextPrecision(),
    ]
    logger.info(
        "Evaluating on dataset {} with metrics {}",
        dataset.name,
        [type(m).__name__ for m in scoring_metrics],
    )

    runner = _BackgroundLoop()
    try:
        evaluate(
            dataset=dataset,
            task=lambda sample: runner.run(evaluation_task(sample, conversations, mentors)),
            scoring_metrics=scoring_metrics,
            experiment_config={
                "model_id": settings.openrouter.LLM_MODEL,
                "dataset_name": dataset.name,
            },
            task_threads=workers,
            nb_samples=nb_samples,
            prompts=get_used_prompts(),
        )
    finally:
        runner.close()
    logger.info("Evaluation completed")


def get_used_prompts() -> list[BasePrompt]:
    """Return the Opik prompts the agent uses, skipping any not registered."""
    client = opik.Opik()
    prompts = (client.get_prompt(name=name) for name in USED_PROMPT_NAMES)
    return [p for p in prompts if p is not None]


async def evaluation_task(
    sample: dict[str, Any],
    conversations: ConversationService,
    mentors: MongoRepository[MentorExtract],
) -> dict[str, Any]:
    """Run the agent on one dataset sample.

    Args:
        sample: Must contain ``mentor_id`` and ``messages``; every message but
            the last is sent to the agent, the last is the expected answer.
        conversations: The conversation service.
        mentors: Repository to look the mentor up in.

    Returns:
        ``input``, ``context``, ``output`` and ``expected_output`` for scoring.

    Raises:
        MentorNotFoundException: If ``mentor_id`` is not in the database.
    """
    mentor_id = sample["mentor_id"]
    mentor = await asyncio.to_thread(mentors.fetch_one, {"id": mentor_id})
    if mentor is None:
        raise MentorNotFoundException(mentor_id)

    input_messages = sample["messages"][:-1]
    reply = await conversations.respond(
        mentor.to_mentor(), input_messages, conversation_id=f"eval-{uuid.uuid4().hex}"
    )
    return {
        "input": input_messages,
        "context": state_to_str(reply.state),
        "output": reply.content,
        "expected_output": sample["messages"][-1],
    }
