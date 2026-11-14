# Mentor Agent

> FastAPI service and LangGraph agent. Each mentor answers from a hybrid
> (vector + full-text) retriever over their own sources in MongoDB Atlas.
> Detail: [README.md](README.md).

## Quick Reference

| Item       | Value                                                                         |
| ---------- | ----------------------------------------------------------------------------- |
| Port       | 8000                                                                          |
| Entry      | `uvicorn mentor_agent.main:app` (or `./run.sh`, `mentor-agent serve`)         |
| Health     | `GET /health` (liveness), `GET /ready` (MongoDB ping)                         |
| API prefix | `/api/v1` (`API_V1_PREFIX`, `routes/v1`); chat streams over `/api/v1/ws/chat` |
| Module     | `mentor_agent`; Python from the root `.python-version`                        |
| Contract   | `libs/mentor-agent-contracts` (`make openapi`)                                |

## Key Files

| File                                    | Purpose                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `mentor_agent/server.py`                | App factory and lifespan (builds shared services once)                       |
| `mentor_agent/main.py`                  | Uvicorn entry point                                                          |
| `mentor_agent/routes/health.py`         | `/health` and `/ready` (unversioned)                                         |
| `mentor_agent/routes/v1/`               | Chat (HTTP + WebSocket), mentors, admin; mounted in `__init__.py`            |
| `mentor_agent/schemas/`                 | Request and response bodies (`common`, `health`, `v1/*`)                     |
| `mentor_agent/core/dependencies.py`     | FastAPI dependencies: services from app state, API-key auth                  |
| `mentor_agent/core/errors.py`           | `MentorAgentError` subclasses and the handlers that render them              |
| `mentor_agent/core/request_context.py`  | Request id on every request and log line, CORS                               |
| `mentor_agent/config/`                  | `settings.<group>.<FIELD>`, one module per group; `API_V1_PREFIX`            |
| `mentor_agent/core/bootstrap.py`        | Composition root: models, retriever, graph, checkpointer                     |
| `mentor_agent/chat/graph.py`            | The LangGraph graph, and the `MentorGraph` / `Checkpointer` types            |
| `mentor_agent/services/conversation.py` | One chat turn (invoke or stream) and conversation deletion                   |
| `mentor_agent/services/mentors.py`      | The catalogue: list, add (pool or custom), edit, memory status               |
| `mentor_agent/services/custom.py`       | Ids for custom mentors, from their name (pure, tested)                       |
| `mentor_agent/services/research.py`     | Web research on a custom mentor (Claude web search), link filters            |
| `mentor_agent/services/enrich.py`       | Background job: research, complete the mentor, build memory                  |
| `mentor_agent/services/persona.py`      | Persona from name + notes; fallback when research is off or fails            |
| `mentor_agent/services/pool.py`         | The random pick from `data/mentor_pool.json` (pure, tested)                  |
| `mentor_agent/services/memory.py`       | One mentor's background memory build; records ready or failed                |
| `mentor_agent/rag/`                     | Extractors, splitter, embeddings, hybrid retriever, memory                   |
| `mentor_agent/integrations/`            | Optional Exa, Firecrawl and Arcade clients; `IntegrationFactory` builds them |
| `mentor_agent/core/tracing.py`          | Opik tracing and dataset helpers (optional)                                  |
| `mentor_agent/export_openapi.py`        | The OpenAPI document the web contract is generated from                      |
| `tests/unit/`, `tests/contract/`        | Module tests; the HTTP/WebSocket API as clients see it                       |
| `tests/fakes.py`                        | Scripted chat model, in-memory checkpointer and services                     |

## Rules

- Every module starts with `from __future__ import annotations`. Type-only
  imports go under `if TYPE_CHECKING:`, except in Pydantic models, FastAPI
  routes and dependencies, and the Typer CLI, which read annotations at runtime.
- New routes go in `routes/v1/` with their bodies in `schemas/v1/`. After any
  route or schema change run `make openapi` and commit both contract files.
- Pyright runs in **strict** mode. Fix types instead of ignoring them. An ignore
  names its rule and says why: `# pyright: ignore[reportPrivateUsage]`.
- Raise `MentorAgentError` subclasses, named `*Error`. Put the message in a
  variable before `raise`. No `assert` outside tests.
- `except Exception` only at a real boundary, with the traceback logged and
  `# noqa: BLE001 - <why>`. Otherwise catch the specific exception.
- Log with loguru and arguments, never f-strings: `logger.info("Loaded {}", n)`.
- No side effects at import time; never construct a `MongoClient` directly
  (use `db.client.get_mongo_client()`).
- Shared plumbing (composition root, dependencies, errors, logging, request
  context, tracing) lives in `core/`. Entry points (`main.py`, `server.py`,
  `cli.py`, `export_openapi.py`) stay at the package top: uvicorn, the console
  script, the Makefile and CI call them by path.
- Third-party services live in `integrations/`, one module per provider, each
  behind a protocol. Build them only through `IntegrationFactory`, which returns
  `None` when the key is unset.
- Secrets are `SecretStr`; never log them, prompts or retrieved documents.
- Read the Anthropic key with `settings.anthropic.require_api_key()` (chat) and the
  OpenRouter key with `settings.openrouter.require_api_key()` (embeddings) where a model
  is called, never at import: commands that call no model must work without it.
- Anything that costs money or changes data (add, edit, rebuild, reset) depends on
  `require_api_key_in_production`.
- Tests never touch the network or a real database: use `tests/fakes.py`.

## Commands

`make` in this directory lists every shortcut. MongoDB runs from `infra/`.

```bash
make -C ../../infra up     # MongoDB
make env                   # create .env, then fill in ANTHROPIC_API_KEY and OPENROUTER_API_KEY
./run.sh                   # API with reload on :8000 (./run.sh seed: mentors + memory)
make fmt                   # ruff format + safe fixes
make test                  # = scripts/ci/python-checks.sh agents/mentor_agent unit
make audit                 # = scripts/ci/python-checks.sh agents/mentor_agent audit
make openapi               # refresh libs/mentor-agent-contracts after an API change
make docker-up             # the agent in Docker, on the infra network
```

Coverage must stay at or above `fail_under` in `pyproject.toml`; raise it when
you add tests. After changing dependencies, run `uv lock` and `make audit`.
