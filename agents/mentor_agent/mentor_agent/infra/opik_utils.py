"""Opik (Comet) integration: tracing configuration and dataset helpers."""

from __future__ import annotations

import os
from typing import Any

import opik
from loguru import logger
from opik.configurator.configure import OpikConfigurator
from opik.rest_api.errors import NotFoundError

from mentor_agent.core.config import settings


def _default_workspace(api_key: str) -> str | None:
    try:
        # Opik has no public call for the account's default workspace.
        return OpikConfigurator(api_key=api_key)._get_default_workspace()  # pyright: ignore[reportPrivateUsage]
    except Exception:  # noqa: BLE001 - tracing is optional; fall back to Opik's default
        logger.opt(exception=True).warning(
            "Could not resolve the default Opik workspace; using Opik's default"
        )
        return None


def configure_opik() -> bool:
    """Configure Opik when ``COMET_API_KEY`` is set, and version the prompts.

    Returns:
        Whether Opik tracing is enabled. Misconfiguration is logged and
        tracing is disabled; it never stops the application.
    """
    comet = settings.comet
    if comet.API_KEY is None:
        logger.info("COMET_API_KEY not set; Opik tracing disabled")
        return False

    api_key = comet.API_KEY.get_secret_value()
    workspace = _default_workspace(api_key)
    os.environ["OPIK_PROJECT_NAME"] = comet.PROJECT
    try:
        opik.configure(api_key=api_key, workspace=workspace, use_local=False, force=True)
    except Exception:  # noqa: BLE001 - tracing is optional and must never stop the app
        logger.opt(exception=True).warning("Could not configure Opik; tracing disabled")
        return False

    from mentor_agent.workflow.prompt import register_prompts

    register_prompts()
    logger.info("Opik configured (workspace={}, project={})", workspace, comet.PROJECT)
    return True


def get_opik_dataset(name: str) -> opik.Dataset | None:
    """Return the named Opik dataset, or ``None`` if it does not exist."""
    try:
        return opik.Opik().get_dataset(name=name)
    except NotFoundError:
        return None


def create_opik_dataset(name: str, description: str, items: list[dict[str, Any]]) -> opik.Dataset:
    """Create (replacing any existing) Opik dataset ``name`` with ``items``."""
    client = opik.Opik()
    if get_opik_dataset(name) is not None:
        client.delete_dataset(name=name)
    dataset = client.create_dataset(name=name, description=description)
    dataset.insert(items)
    return dataset
