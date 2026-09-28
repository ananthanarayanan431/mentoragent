from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from pathlib import Path


class Message(BaseModel):
    """A message in a conversation between a user and an assistant."""

    role: Literal["user", "assistant"] = Field(description="Role of the message sender")
    content: str = Field(description="Content of the message")


class EvaluationDatasetSample(BaseModel):
    """A sample conversation used for evaluation.

    Attributes:
        mentor_id: The mentor the conversation is with.
        messages: The conversation, oldest message first.
    """

    mentor_id: str | None = None
    messages: list[Message]


class EvaluationDataset(BaseModel):
    """A collection of evaluation samples."""

    samples: list[EvaluationDatasetSample]

    def save_to_json(self, file_path: Path) -> None:
        """Write the dataset to ``file_path`` as pretty-printed JSON.

        Raises:
            OSError: If the file cannot be written.
        """
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(self.model_dump_json(indent=4), encoding="utf-8")
