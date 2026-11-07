"""Uvicorn entry point: ``uvicorn mentor_agent.main:app`` (or ``mentor-agent serve``)."""

from __future__ import annotations

from mentor_agent.server import create_app

app = create_app()
