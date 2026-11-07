# MentorAgents backend

> FastAPI service and LangGraph agent. Each mentor answers from a hybrid
> (vector + full-text) retriever over their own sources in MongoDB Atlas.
> Detail: [README.md](README.md).

## Quick Reference

| Item       | Value                                                         |
| ---------- | ------------------------------------------------------------- |
| Port       | 8000                                                          |
| Entry      | `uv run mentoragent serve` (or `make serve` for autoreload)   |
| Health     | `GET /health` (liveness), `GET /ready` (MongoDB ping)         |
| API prefix | `/api/v1`; chat streams over `/api/v1/ws/chat`                |
| Package    | `src/mentoragent` (src layout), Python from `.python-version` |

## Key Files

| File                                       | Purpose                                                           |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `src/mentoragent/api/main.py`              | App factory and lifespan (builds shared services once)            |
| `src/mentoragent/api/routes/`              | HTTP and WebSocket routes                                         |
| `src/mentoragent/bootstrap.py`             | Composition root: models, retriever, graph, checkpointer          |
| `src/mentoragent/workflow/graph.py`        | The LangGraph graph, and the `MentorGraph` / `Checkpointer` types |
| `src/mentoragent/services/conversation.py` | One chat turn (invoke or stream) and conversation deletion        |
| `src/mentoragent/rag/`                     | Extractors, splitter, embeddings, hybrid retriever, memory        |
| `src/mentoragent/core/config/`             | `settings.<group>.<FIELD>`, one module per group                  |
| `src/mentoragent/core/exceptions.py`       | `MentorAgentError` and subclasses, each with a `status_code`      |
| `tests/fakes.py`                           | Scripted chat model, in-memory checkpointer and services          |

## Rules

- Every module starts with `from __future__ import annotations`. Type-only
  imports go under `if TYPE_CHECKING:`, except in Pydantic models, FastAPI
  routes and dependencies, and the Typer CLI, which read annotations at runtime.
- Pyright runs in **strict** mode. Fix types instead of ignoring them. An ignore
  names its rule and says why: `# pyright: ignore[reportPrivateUsage]`.
- Raise `MentorAgentError` subclasses, named `*Error`. Put the message in a
  variable before `raise`. No `assert` outside tests.
- `except Exception` only at a real boundary, with the traceback logged and
  `# noqa: BLE001 - <why>`. Otherwise catch the specific exception.
- Log with loguru and arguments, never f-strings: `logger.info("Loaded {}", n)`.
- No side effects at import time; never construct a `MongoClient` directly
  (use `db.client.get_mongo_client()`).
- Secrets are `SecretStr`; never log them, prompts or retrieved documents.
- Tests never touch the network or a real database: use `tests/fakes.py`.

## Commands

```bash
make help                              # every target
make install && make env && make up    # first-time setup; then fill in .env
make serve                             # MongoDB + API with autoreload
make format                            # ruff fix + format
make check                             # = ../scripts/ci/python-checks.sh unit
make audit                             # = ../scripts/ci/python-checks.sh audit
make coverage                          # tests with line-by-line coverage
make seed                              # load mentors and build long-term memory (calls the embeddings API)
```

Coverage must stay at or above `fail_under` in `pyproject.toml`; raise it when
you add tests. After changing dependencies, run `uv lock` and `make audit`.
