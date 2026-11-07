"""Builds one mentor's long-term memory in the background, and records the outcome."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from loguru import logger
from starlette.concurrency import run_in_threadpool

if TYPE_CHECKING:
    from collections.abc import Callable

    from mentor_agent.models.mentor_extract import MentorExtract
    from mentor_agent.services.mentors import MentorService


class MemoryBuilder(Protocol):
    """Rebuilds a mentor's memory; the API runs it as a background task."""

    async def rebuild(self, mentor_id: str) -> None: ...


class MentorMemoryBuilder:
    """Extract, chunk, embed and index one mentor, then mark their memory ready or failed.

    Args:
        mentors: Where the mentor is read from and the status is written to.
        rebuild_one: Blocking rebuild of one mentor (``LongTermMemoryCreator.rebuild_one``);
            run in a worker thread. Injected so tests never call an embeddings API.
    """

    def __init__(self, mentors: MentorService, rebuild_one: Callable[[MentorExtract], int]) -> None:
        self.mentors = mentors
        self.rebuild_one = rebuild_one

    async def rebuild(self, mentor_id: str) -> None:
        try:
            mentor = await self.mentors.get_mentor(mentor_id)
            chunks = await run_in_threadpool(self.rebuild_one, mentor)
        except Exception:  # noqa: BLE001 - a background job: record the failure, keep serving
            logger.exception("Memory build failed for {}", mentor_id)
            await self.mentors.set_memory_status(mentor_id, "failed")
            return
        if chunks == 0:
            # Nothing found in any source: the mentor answers without background.
            await self.mentors.set_memory_status(mentor_id, "failed")
            return
        await self.mentors.set_memory_status(mentor_id, "ready")
        logger.info("Memory ready for {} ({} chunks)", mentor_id, chunks)
