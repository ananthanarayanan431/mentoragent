from __future__ import annotations

from loguru import logger

from mentoragent.core.config import settings
from mentoragent.core.logging import configure_logging


def main() -> None:
    configure_logging()
    logger.info(
        "{} {} ({})", settings.app.PROJECT_NAME, settings.app.APP_VERSION, settings.app.ENVIRONMENT
    )


if __name__ == "__main__":
    main()
