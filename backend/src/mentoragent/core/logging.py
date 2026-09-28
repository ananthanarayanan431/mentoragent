"""Logging configuration.

The project logs through loguru everywhere; import it directly::

    from loguru import logger

    logger.info("Ingested {} documents for {}", count, mentor_id)

Pass values as arguments rather than f-strings: formatting is then skipped
for filtered-out levels, and the raw values stay available to JSON sinks.

Attach structured context with ``bind`` (one logger) or ``contextualize``
(everything logged inside a block, e.g. a request)::

    log = logger.bind(component="ingestion")
    with logger.contextualize(request_id=request_id):
        ...

Call :func:`configure_logging` once at process start-up (API app, CLI
scripts). It also routes stdlib ``logging`` records - from uvicorn, pymongo,
LangChain, ... - into loguru so every line shares one format.
"""

from __future__ import annotations

import inspect
import logging
import sys
from typing import TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    from mentoragent.core.config.app import AppSettings

_HUMAN_FORMAT = (
    "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
    "<level>{level: <8}</level> | "
    "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
    "<level>{message}</level> | {extra}"
)

# Third-party loggers that are noisy at INFO and rarely useful.
_QUIET_LOGGERS = ("pymongo", "httpx", "httpcore", "urllib3")


class InterceptHandler(logging.Handler):
    """Forward stdlib ``logging`` records to loguru.

    Taken from the loguru documentation; it keeps the caller's location
    instead of reporting every record as coming from this handler.
    """

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level: str | int = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame, depth = inspect.currentframe(), 0
        while frame and (depth == 0 or frame.f_code.co_filename == logging.__file__):
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def configure_logging(app_settings: AppSettings | None = None) -> None:
    """Configure the process-wide logger. Safe to call more than once.

    Args:
        app_settings: Source of ``LOG_LEVEL`` / ``LOG_JSON`` / ``DEBUG``.
            Defaults to the global settings.
    """
    if app_settings is None:
        from mentoragent.core.config import settings

        app_settings = settings.app

    level = "DEBUG" if app_settings.DEBUG else app_settings.LOG_LEVEL

    logger.remove()
    logger.add(
        sys.stdout,
        level=level,
        serialize=app_settings.LOG_JSON,
        format=_HUMAN_FORMAT,
        colorize=not app_settings.LOG_JSON,
        # Variable values in tracebacks can include secrets; only show them locally.
        backtrace=app_settings.LOCAL_DEVELOPMENT,
        diagnose=app_settings.LOCAL_DEVELOPMENT,
    )

    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)
    for name in _QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)


__all__ = ["InterceptHandler", "configure_logging", "logger"]
