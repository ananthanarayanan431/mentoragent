from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings

from mentoragent.core.config.base import settings_config


class MongoSettings(BaseSettings):
    """MongoDB connection and collection names.

    Every field is read with the ``MONGO_`` prefix, so ``URI`` comes from
    ``MONGO_URI``. ``MONGO_USER`` / ``MONGO_PASSWORD`` / ``MONGO_PORT`` also
    live in ``.env`` but belong to docker-compose.yml, not to this class;
    they are ignored here.

    Attributes:
        URI: Connection URI for the local MongoDB Atlas instance.
        DB_NAME: The name of the MongoDB database.
        MENTORS_COLLECTION: Collection holding mentor documents.
        STATE_CHECKPOINT_COLLECTION: Collection for LangGraph state checkpoints.
        STATE_WRITES_COLLECTION: Collection for LangGraph state writes.
        LONG_TERM_MEMORY_COLLECTION: Collection for long term memory.
    """

    model_config = settings_config("MONGO_")

    URI: str = Field(
        default="mongodb://mentor_user:mentor_password@localhost:27017/?directConnection=true",
        description="Connection URI for the local MongoDB Atlas instance.",
    )
    DB_NAME: str = "mentoragents"
    MENTORS_COLLECTION: str = "mentors"
    STATE_CHECKPOINT_COLLECTION: str = "mentor_state_checkpoints"
    STATE_WRITES_COLLECTION: str = "mentor_state_writes"
    LONG_TERM_MEMORY_COLLECTION: str = "mentor_long_term_memory"
