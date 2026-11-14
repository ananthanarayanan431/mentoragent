"""Shared plumbing the entry points build on: the composition root, FastAPI
dependencies, errors and their handlers, logging, request context and tracing.

Import from the modules themselves (``mentor_agent.core.errors``); this package
re-exports nothing, so importing one piece never loads the rest.
"""
