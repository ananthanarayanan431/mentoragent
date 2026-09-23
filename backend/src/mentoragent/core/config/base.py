from pydantic_settings import SettingsConfigDict


def settings_config(prefix: str = "") -> SettingsConfigDict:
    """Build the loader config shared by every settings group.

    Args:
        prefix: Environment variable prefix for the group, e.g. ``"MONGO_"``.
            A group declaring ``URI`` under that prefix reads ``MONGO_URI``,
            which keeps ``.env`` flat while the Python side stays nested.

    Returns:
        SettingsConfigDict: The loader config for a settings group.

    Note:
        ``extra="ignore"`` is load-bearing, not cosmetic. pydantic-settings
        defaults to ``extra="forbid"``, so without this every group would
        raise on the *other* groups' variables the moment it read ``.env``.
    """
    return SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix=prefix,
        case_sensitive=False,
        extra="ignore",
    )
