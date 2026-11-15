"""The advice ledger: one short line per piece of advice a mentor gives the user,
shared with every mentor in the square."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger
from pydantic import BaseModel, Field

from mentor_agent.models.ledger import LedgerLine
from mentor_agent.prompts import LEDGER_SYSTEM_PROMPT

if TYPE_CHECKING:
    from collections.abc import Callable

    from langchain_core.language_models import BaseChatModel

    from mentor_agent.db.client import AsyncMongoRepository
    from mentor_agent.models.mentor_extract import MentorExtract


class LedgerNote(BaseModel):
    """What the summary model returns for one exchange; nulls mean "no advice"."""

    topic: str | None = Field(default=None, max_length=40)
    advice: str | None = Field(default=None, max_length=200)


class AdviceLedger(Protocol):
    """Where ledger lines are kept."""

    async def add(self, line: LedgerLine) -> None: ...

    async def recent(self, limit: int) -> list[LedgerLine]: ...

    async def delete(self, line_id: str) -> bool: ...


class LedgerWriter(Protocol):
    """Notes one exchange in the ledger; never raises."""

    async def record(
        self, mentor: MentorExtract, conversation_id: str, question: str, reply: str
    ) -> None: ...


class MongoAdviceLedger:
    """The ledger in MongoDB.

    Args:
        repository: Async repository over the ledger collection.
    """

    def __init__(self, repository: AsyncMongoRepository[LedgerLine]) -> None:
        self.repository = repository

    async def add(self, line: LedgerLine) -> None:
        await self.repository.insert_one(line)

    async def recent(self, limit: int) -> list[LedgerLine]:
        """The newest ``limit`` lines, newest first."""
        return await self.repository.fetch_documents({}, limit=limit, sort=[("created_at", -1)])

    async def delete(self, line_id: str) -> bool:
        return await self.repository.delete_one({"id": line_id})


def _exchange(mentor: MentorExtract, question: str, reply: str) -> str:
    return f"Mentor: {mentor.name}\n\nUser: {question}\n\n{mentor.name}: {reply}"


class LlmLedgerWriter:
    """Asks the summary model for a topic and the advice, and saves them as one line.

    Args:
        model_factory: Builds the chat model on first use, so the API starts without
            an Anthropic key.
        ledger: Where the line is saved.
    """

    def __init__(self, model_factory: Callable[[], BaseChatModel], ledger: AdviceLedger) -> None:
        self.model_factory = model_factory
        self.ledger = ledger

    async def record(
        self, mentor: MentorExtract, conversation_id: str, question: str, reply: str
    ) -> None:
        try:
            model = self.model_factory().with_structured_output(LedgerNote)
            result = await model.ainvoke(
                [
                    SystemMessage(content=LEDGER_SYSTEM_PROMPT),
                    HumanMessage(content=_exchange(mentor, question, reply)),
                ]
            )
            note = LedgerNote.model_validate(result)
            if not note.topic or not note.advice:
                return
            await self.ledger.add(
                LedgerLine(
                    mentor_id=mentor.id,
                    mentor_name=mentor.name,
                    conversation_id=conversation_id,
                    topic=note.topic,
                    advice=note.advice,
                )
            )
            logger.debug("Noted advice from {} in the ledger", mentor.id)
        except Exception:  # noqa: BLE001 - a background job: the chat must not notice
            logger.exception("Could not note advice from {} in the ledger", mentor.id)
