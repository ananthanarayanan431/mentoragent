from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class AgentSettings(BaseSettings):
    """Conversation memory thresholds.

    Attributes:
        TOTAL_MESSAGES_SUMMARY_TRIGGER: Message count that triggers summarisation.
        TOTAL_MESSAGES_AFTER_SUMMARY: Messages kept verbatim after summarising.
    """

    model_config = settings_config()

    TOTAL_MESSAGES_SUMMARY_TRIGGER: int = Field(default=30, gt=0)
    TOTAL_MESSAGES_AFTER_SUMMARY: int = Field(default=5, gt=0)
