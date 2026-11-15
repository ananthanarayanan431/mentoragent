"""Uvicorn entry point: ``uvicorn mentor_agent.main:app`` (``./run.sh`` adds reload)."""

from __future__ import annotations

from mentor_agent.server import create_app

app = create_app()
