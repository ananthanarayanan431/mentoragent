"""The advice ledger: one short line per piece of advice a mentor gives the user,
shared with every mentor in the same square (and with no other square)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

from mentor_agent.config import settings
from mentor_agent.models.ledger import LedgerLine
from mentor_agent.prompts import LEDGER_SYSTEM_PROMPT

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from datetime import datetime

    from langchain_core.language_models import BaseChatModel

    from mentor_agent.db.client import AsyncMongoRepository
    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.squares import SquareReader

#: Lines read from the store per reply: enough to find the newest few from other mentors.
_LINES_SCANNED = 50


class LedgerNote(BaseModel):
    """What the summary model returns for one exchange; nulls mean "no advice"."""

    topic: str | None = Field(default=None, max_length=40)
    advice: str | None = Field(default=None, max_length=200)


class AdviceLedger(Protocol):
    """Where ledger lines are kept."""

    async def add(self, line: LedgerLine) -> None: ...

    async def recent(self, square_id: str, limit: int) -> list[LedgerLine]: ...

    async def delete(self, square_id: str, line_id: str) -> bool: ...

    async def delete_square(self, square_id: str) -> int: ...


class LedgerWriter(Protocol):
    """Notes one exchange in the ledger; never raises."""

    async def record(
        self,
        square_id: str,
        mentor: MentorExtract,
        conversation_id: str,
        question: str,
        reply: str,
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

    async def recent(self, square_id: str, limit: int) -> list[LedgerLine]:
        """The square's newest ``limit`` lines, newest first."""
        return await self.repository.fetch_documents(
            {"square_id": square_id}, limit=limit, sort=[("created_at", -1)]
        )

    async def delete(self, square_id: str, line_id: str) -> bool:
        return await self.repository.delete_one({"square_id": square_id, "id": line_id})

    async def delete_square(self, square_id: str) -> int:
        return await self.repository.delete_many({"square_id": square_id})


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
        self,
        square_id: str,
        mentor: MentorExtract,
        conversation_id: str,
        question: str,
        reply: str,
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
                    square_id=square_id,
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


def ledger_context(
    goal: str | None, lines: Sequence[LedgerLine], mentor_id: str, limit: int | None = None
) -> str:
    """The context one mentor reads before replying: the goal, then the newest advice
    from the other mentors (their own is in their conversation already). Pure.

    Args:
        goal: The user's goal, if set.
        lines: Ledger lines, newest first.
        mentor_id: The mentor about to reply.
        limit: Lines kept; defaults to ``LEDGER_LINES_IN_CONTEXT``.
    """
    keep = settings.agent.LEDGER_LINES_IN_CONTEXT if limit is None else limit
    others = [line for line in lines if line.mentor_id != mentor_id][:keep]
    parts = [f"The user's goal: {goal}"] if goal else []
    parts += [f"{line.mentor_name} advised, on {line.topic}: {line.advice}" for line in others]
    return "\n".join(parts)


def should_open(mentor_id: str, lines: Sequence[LedgerLine], heard_until: datetime | None) -> bool:
    """Whether a mentor has news to open with: another mentor's advice newer than
    both their own newest advice and what they already reacted to. Pure."""
    seen: list[datetime] = [line.created_at for line in lines if line.mentor_id == mentor_id]
    if heard_until is not None:
        seen.append(heard_until)
    others: list[datetime] = [line.created_at for line in lines if line.mentor_id != mentor_id]
    if not others:
        return False
    return not seen or max(others) > max(seen)


async def shared_context(
    squares: SquareReader, ledger: AdviceLedger, square_id: str, mentor_id: str
) -> str:
    """Read the square's goal and ledger for one mentor; empty if the database fails,
    so a reply never depends on it."""
    try:
        goal = (await squares.get(square_id)).goal
        lines = await ledger.recent(square_id, _LINES_SCANNED)
    except PyMongoError:
        logger.exception("Could not read the shared context for {}", mentor_id)
        return ""
    return ledger_context(goal, lines, mentor_id)
