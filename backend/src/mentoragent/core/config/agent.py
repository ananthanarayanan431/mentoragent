from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class AgentSettings(BaseSettings):
    """Conversation memory thresholds.

    Attributes:
        TOTAL_MESSAGES_SUMMARY_TRIGGER: Message count that triggers a summary.
        TOTAL_MESSAGES_AFTER_SUMMARY: Messages retained after summarising.
    """

    model_config = settings_config()

    TOTAL_MESSAGES_SUMMARY_TRIGGER: int = 30
    TOTAL_MESSAGES_AFTER_SUMMARY: int = 5
