"""Ambient chats: now and then two mentors meet in the square. If both have advised
the user they talk about the user's goal; otherwise they have a simple chat and move
on. The browser asks for one while the square is open; the server checks, writes and
stores it."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal, Protocol

from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger
from pydantic import BaseModel, Field

from mentor_agent.config import settings
from mentor_agent.core.errors import (
    AmbientNotEligibleError,
    AmbientTooSoonError,
    ConversationError,
)
from mentor_agent.models.ambient import AmbientChat, AmbientLine
from mentor_agent.prompts import AMBIENT_SMALL_TALK_PROMPT, AMBIENT_SYSTEM_PROMPT

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from langchain_core.language_models import BaseChatModel

    from mentor_agent.db.client import AsyncMongoRepository
    from mentor_agent.models.ledger import LedgerLine
    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.ledger import AdviceLedger, ProfileReader

#: Ledger lines read to check eligibility and to remind the mentors what they said.
_LINES_SCANNED = 50
#: Each mentor's own advice the writer sees.
_ADVICE_PER_MENTOR = 3


class AmbientScriptLine(BaseModel):
    """One line as the model writes it: ``a`` or ``b`` speaks."""

    speaker: Literal["a", "b"]
    text: str = Field(min_length=1, max_length=160)


class AmbientScript(BaseModel):
    """What the model returns: 2 to 4 lines."""

    lines: list[AmbientScriptLine] = Field(min_length=2, max_length=4)


class AmbientStore(Protocol):
    """Where ambient chats are kept."""

    async def add(self, chat: AmbientChat) -> None: ...

    async def newest_time(self) -> datetime | None: ...

    async def get(self, chat_id: str) -> AmbientChat | None: ...


class AmbientWriter(Protocol):
    """Writes what two mentors say; raises ``ConversationError`` on failure."""

    async def write(
        self,
        a: MentorExtract,
        b: MentorExtract,
        goal: str | None,
        lines: Sequence[LedgerLine],
        *,
        about_user: bool,
    ) -> list[AmbientLine]: ...


class MentorReader(Protocol):
    async def get_mentor(self, mentor_id: str) -> MentorExtract: ...


def check_eligible(a: MentorExtract, b: MentorExtract) -> None:
    """Both mentors can chat: neither is still reading up on their sources. Pure.

    Raises:
        AmbientNotEligibleError: Naming the mentor who cannot.
    """
    for mentor in (a, b):
        if mentor.memory == "building":
            msg = f"{mentor.name} is still reading up on their sources."
            raise AmbientNotEligibleError(msg)


def chat_about_user(a: MentorExtract, b: MentorExtract, lines: Sequence[LedgerLine]) -> bool:
    """Whether the two talk about the user: only when both have advised them. Pure."""
    advised = {line.mentor_id for line in lines}
    return a.id in advised and b.id in advised


def too_soon(last: datetime | None, now: datetime, interval_seconds: int) -> bool:
    """Whether the last chat is younger than the floor between two chats. Pure."""
    return last is not None and (now - last).total_seconds() < interval_seconds


def lines_for(script: AmbientScript, a_id: str, b_id: str) -> list[AmbientLine]:
    """The script with ``a`` and ``b`` replaced by the mentors' ids. Pure."""
    ids = {"a": a_id, "b": b_id}
    return [AmbientLine(mentor_id=ids[line.speaker], text=line.text) for line in script.lines]


class AmbientChats:
    """Starts an ambient chat between two mentors when the browser asks.

    Args:
        mentors: The catalogue (raises ``MentorNotFoundError`` for unknown ids).
        ledger: The advice ledger.
        profile: The user's profile (their goal).
        store: Where chats are kept.
        writer: Writes the lines.
        clock: The current time; injected so tests control it.
    """

    def __init__(
        self,
        mentors: MentorReader,
        ledger: AdviceLedger,
        profile: ProfileReader,
        store: AmbientStore,
        writer: AmbientWriter,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.mentors = mentors
        self.ledger = ledger
        self.profile = profile
        self.store = store
        self.writer = writer
        self.clock = clock

    async def start(self, a_id: str, b_id: str) -> AmbientChat:
        """Write and store a chat between ``a_id`` (who speaks first) and ``b_id``.

        Both talk about the user's goal when both have advised them; otherwise they
        have a simple chat between themselves.

        Raises:
            MentorNotFoundError: If a mentor does not exist.
            AmbientNotEligibleError: If a mentor is still reading up on their sources.
            AmbientTooSoonError: If the last chat was too recent.
            ConversationError: If the model fails.
        """
        a = await self.mentors.get_mentor(a_id)
        b = await self.mentors.get_mentor(b_id)
        lines = await self.ledger.recent(_LINES_SCANNED)
        check_eligible(a, b)
        interval = settings.agent.AMBIENT_MIN_INTERVAL_SECONDS
        if too_soon(await self.store.newest_time(), self.clock(), interval):
            raise AmbientTooSoonError
        goal = (await self.profile.get()).goal
        about_user = chat_about_user(a, b, lines)
        chat = AmbientChat(
            mentor_ids=[a.id, b.id],
            lines=await self.writer.write(a, b, goal, lines, about_user=about_user),
            about_user=about_user,
            created_at=self.clock(),
        )
        await self.store.add(chat)
        return chat


class MongoAmbientStore:
    """Ambient chats in MongoDB."""

    def __init__(self, repository: AsyncMongoRepository[AmbientChat]) -> None:
        self.repository = repository

    async def add(self, chat: AmbientChat) -> None:
        await self.repository.insert_one(chat)

    async def newest_time(self) -> datetime | None:
        newest = await self.repository.fetch_documents({}, limit=1, sort=[("created_at", -1)])
        return newest[0].created_at if newest else None

    async def get(self, chat_id: str) -> AmbientChat | None:
        return await self.repository.fetch_one({"id": chat_id})


def _persona(label: str, mentor: MentorExtract, lines: Sequence[LedgerLine] | None) -> str:
    """One mentor for the writer; with ``lines``, also what they told the user."""
    persona = (
        f"Mentor {label}: {mentor.name}\n"
        f"  Perspective: {mentor.perspective}\n"
        f"  Style: {mentor.style}"
    )
    if lines is None:
        return persona
    advice = [line.advice for line in lines if line.mentor_id == mentor.id][:_ADVICE_PER_MENTOR]
    told = "\n".join(f"  - {item}" for item in advice) or "  - (nothing yet)"
    return f"{persona}\n  What they told the user:\n{told}"


class LlmAmbientWriter:
    """Asks the summary model for the chat in one structured call.

    Args:
        model_factory: Builds the chat model on first use.
    """

    def __init__(self, model_factory: Callable[[], BaseChatModel]) -> None:
        self.model_factory = model_factory

    async def write(
        self,
        a: MentorExtract,
        b: MentorExtract,
        goal: str | None,
        lines: Sequence[LedgerLine],
        *,
        about_user: bool,
    ) -> list[AmbientLine]:
        if about_user:
            system = AMBIENT_SYSTEM_PROMPT
            parts = [f"The user's goal: {goal or '(not stated)'}"]
            parts += [_persona("a", a, lines), _persona("b", b, lines)]
        else:
            # A simple chat: no goal and no advice, so nothing about the user leaks in.
            system = AMBIENT_SMALL_TALK_PROMPT
            parts = [_persona("a", a, None), _persona("b", b, None)]
        prompt = "\n\n".join(parts)
        try:
            model = self.model_factory().with_structured_output(AmbientScript)
            result = await model.ainvoke(
                [SystemMessage(content=system), HumanMessage(content=prompt)]
            )
            return lines_for(AmbientScript.model_validate(result), a.id, b.id)
        except Exception as exc:
            logger.opt(exception=exc).error("Ambient chat between {} and {} failed", a.id, b.id)
            msg = "The mentors could not chat right now."
            raise ConversationError(msg) from exc
