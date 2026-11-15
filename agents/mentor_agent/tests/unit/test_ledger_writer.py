from __future__ import annotations

from typing import TYPE_CHECKING, Any

from mentor_agent.services.ledger import LedgerNote, LlmLedgerWriter
from tests.fakes import InMemoryAdviceLedger

if TYPE_CHECKING:
    from mentor_agent.models.mentor_extract import MentorExtract


class _StructuredModel:
    """Stands in for a chat model's ``with_structured_output``: returns a fixed note."""

    def __init__(self, note: LedgerNote | Exception) -> None:
        self.note = note
        self.received: list[Any] = []

    def with_structured_output(self, _schema: type[LedgerNote]) -> _StructuredModel:
        return self

    async def ainvoke(self, messages: Any) -> LedgerNote:
        self.received.append(messages)
        if isinstance(self.note, Exception):
            raise self.note
        return self.note


def _writer(
    note: LedgerNote | Exception,
) -> tuple[LlmLedgerWriter, InMemoryAdviceLedger, _StructuredModel]:
    model = _StructuredModel(note)
    ledger = InMemoryAdviceLedger()
    return LlmLedgerWriter(lambda: model, ledger), ledger, model  # pyright: ignore[reportArgumentType]


async def test_real_advice_is_saved_as_one_line(mentor_extract: MentorExtract) -> None:
    writer, ledger, model = _writer(
        LedgerNote(topic="Index funds", advice="Buy low-cost index funds.")
    )

    await writer.record(mentor_extract, "c1", "How should I invest?", "Buy index funds and wait.")

    [line] = await ledger.recent(10)
    assert (line.mentor_id, line.mentor_name, line.conversation_id) == ("ada", "Ada Lovelace", "c1")
    assert (line.topic, line.advice) == ("Index funds", "Buy low-cost index funds.")
    assert "How should I invest?" in str(model.received[0])


async def test_small_talk_writes_nothing(mentor_extract: MentorExtract) -> None:
    writer, ledger, _ = _writer(LedgerNote(topic=None, advice=None))
    await writer.record(mentor_extract, "c1", "hi", "Hello there.")
    assert await ledger.recent(10) == []


async def test_a_model_failure_writes_nothing_and_does_not_raise(
    mentor_extract: MentorExtract,
) -> None:
    writer, ledger, _ = _writer(RuntimeError("model down"))
    await writer.record(mentor_extract, "c1", "How should I invest?", "Index funds.")
    assert await ledger.recent(10) == []
