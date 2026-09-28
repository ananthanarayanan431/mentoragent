# MentorAgents — backend

> Where human expertise meets AI.

MentorAgents lets you chat with AI mentors modelled on real experts. Each mentor
has a name, area of expertise, perspective and speaking style, and answers from
a long-term memory built out of that person's public material: PDFs, Wikipedia,
YouTube transcripts and tweets.

The backend is a FastAPI service around a LangGraph agent. The agent decides
when to search the mentor's long-term memory (hybrid vector + keyword search in
MongoDB Atlas, always scoped to the current mentor) and keeps each conversation's
history in MongoDB, summarising it as it grows.

## Tech stack

| Concern | Choice |
| --- | --- |
| Language / packaging | Python 3.12, [uv](https://docs.astral.sh/uv/) |
| LLM & embeddings | [OpenRouter](https://openrouter.ai) via `langchain-openai` (OpenAI-compatible API) |
| Database & vector search | MongoDB Atlas Local 8.0 (Docker) |
| RAG plumbing | LangChain loaders, splitters and `langchain-mongodb` |
| Agent orchestration | LangGraph, conversations checkpointed in MongoDB |
| Tweets | [Arcade](https://arcade.dev) `X.SearchRecentTweetsByUsername` |
| Evaluation | [Opik](https://www.comet.com/site/products/opik/) |
| API | FastAPI + Uvicorn (async, REST + WebSocket streaming) |
| CLI | Typer (`uv run mentoragent --help`) |

## Quick start

Prerequisites: Python 3.12, `uv`, and Docker with the Compose plugin.

```bash
cd backend
make install   # uv sync — create .venv from uv.lock
make env       # copy .env.example to .env (never overwrites an existing .env)
# now fill in the API keys in .env
make hooks     # install the pre-commit hooks (ruff lint + format)
make up        # start MongoDB Atlas Local and wait until it is healthy
make seed      # load the mentors, then build their long-term memory
make serve     # run the API with autoreload on http://localhost:8000
```

Open http://localhost:8000/docs for the interactive API docs (disabled when
`ENVIRONMENT=prod`).

The mentors live in [`data/extraction_metadata.json`](data/extraction_metadata.json).
Add PDF / YouTube / website URLs and an X handle per mentor to enrich their
memory, then rerun `make seed`. `create-memory` calls the embeddings API for
every chunk; `uv run mentoragent create-memory --sample` does a cheap trial run.

Run `make` with no arguments to list every target.

## Development

| Command | What it does |
| --- | --- |
| `make format` | Auto-fix lint issues and format the code |
| `make lint` | Lint with ruff |
| `make typecheck` | Type-check with mypy |
| `make test` | Run the pytest suite (no network or database needed) |
| `make check` | All of the above; what CI should run |

## CLI

| Command | What it does |
| --- | --- |
| `mentoragent serve [--reload]` | Run the API |
| `mentoragent load-mentors` | Upsert mentors from the metadata file (idempotent) |
| `mentoragent create-memory [--sample]` | Extract sources, chunk, dedupe, embed, index |
| `mentoragent delete-memory` | Drop the long-term memory |
| `mentoragent reset-conversations` | Drop every conversation history |
| `mentoragent generate-dataset` | Build a synthetic evaluation dataset |
| `mentoragent evaluate` | Score the agent with Opik (needs `COMET_API_KEY`) |

Run them with `uv run mentoragent ...`.

## API

All routes except the probes live under `/api/v1`. When `API_KEY` is set they
require an `X-API-Key` header (WebSocket: `?api_key=...` query parameter).

| Method & path | Purpose |
| --- | --- |
| `GET /health` | Liveness probe |
| `GET /ready` | Readiness probe (checks MongoDB) |
| `GET /api/v1/mentors` | List mentors |
| `GET /api/v1/mentors/{mentor_id}` | One mentor |
| `POST /api/v1/chat` | Send a message, get the full reply |
| `WS /api/v1/ws/chat` | Send a message, stream the reply token by token |
| `DELETE /api/v1/conversations/{mentor_id}/{conversation_id}` | Forget a conversation |
| `POST /api/v1/reset-memory` | Drop every conversation (admin) |

Start a conversation by omitting `conversation_id`. The response returns
one; send it back to continue the same conversation:

```bash
curl -s localhost:8000/api/v1/chat -H 'content-type: application/json' \
  -d '{"mentor_id": "warren_buffett", "message": "How do you pick stocks?"}'
# {"mentor_id": "warren_buffett", "conversation_id": "3f2c...", "response": "..."}
```

WebSocket: send the same JSON; the server answers with
`{"type": "start"}`, then `{"type": "chunk", "content": ...}` events, then
`{"type": "end", "response": ...}`, or `{"type": "error", "detail": ...}`.
Errors end the turn, not the connection.

## How a turn works

```text
START -> conversation --(tool call)--> retrieve_context -> summarize_context --+
             ^                                                                  |
             +------------------------------------------------------------------+
         conversation --(history > TOTAL_MESSAGES_SUMMARY_TRIGGER)--> summarize_conversation -> END
         conversation --(otherwise)--> END
```

- The model calls `retrieve_mentor_context` when it needs facts. The mentor id
  is injected from graph state, so retrieval can only return that mentor's sources.
- Tool results are condensed by a cheaper model before the mentor sees them.
- Long histories are folded into a running summary; the cut never separates a
  tool call from its result.
- The graph is compiled once at start-up with a MongoDB checkpointer; each
  conversation is the thread `"{mentor_id}:{conversation_id}"`.
- `RECURSION_LIMIT` caps steps per turn; LLM calls have timeouts and retries.
  Provider failures return `502` with a generic message and are logged with the
  request id.

## Configuration

All settings live in `.env` and are loaded by
[`src/mentoragent/core/config`](src/mentoragent/core/config), one
`BaseSettings` class per concern. Each group reads the variables with its prefix,
so `MONGO_URI` becomes `settings.mongo.URI`:

```python
from mentoragent.core.config import settings

settings.mongo.URI
settings.openrouter.LLM_MODEL
```

Every group can also be built on its own, which helps when debugging one piece:

```python
from mentoragent.core.config import MongoSettings
MongoSettings()
```

Only `OPENROUTER_API_KEY` is required; it serves both chat and embeddings.
Optional integrations switch on when their keys are set (a blank value counts
as unset):

| Variable | Enables |
| --- | --- |
| `API_KEY` | API-key protection for `/api/v1` |
| `ARCADE_API_KEY`, `ARCADE_USER_ID` | Fetching tweets during ingestion |
| `COMET_API_KEY` | Opik tracing, prompt versioning, `mentoragent evaluate` |
| `LANGSMITH_API_KEY` + `LANGSMITH_TRACING=true` | LangSmith tracing |

Every other variable has a default. [`.env.example`](.env.example) lists them all.

> `RAG_TEXT_EMBEDDING_MODEL_ID` is an OpenRouter slug (`openai/text-embedding-3-small`),
> and `RAG_TEXT_EMBEDDING_MODEL_DIM` must match `numDimensions` on the Atlas
> vector search index, or every query fails.

## Calling the LLM

The agent uses LangChain chat models from
[`workflow/llm.py`](src/mentoragent/workflow/llm.py). For direct calls outside
the graph, `Models` in [`workflow/model.py`](src/mentoragent/workflow/model.py)
is a thin async wrapper around the OpenAI SDK, pointed at OpenRouter.

```python
from pydantic import BaseModel
from mentoragent.workflow.model import Models

class Plan(BaseModel):
    topic: str
    steps: list[str]

messages = [{"role": "user", "content": "Plan a week of learning RAG"}]

async with Models("openai/gpt-4o-mini") as llm:
    text = await llm.generate(messages)

    async for token in llm.stream(messages):
        print(token, end="")

    plan = await llm.generate_structured(messages, Plan)  # returns a Plan
```

`generate_structured` sends the Pydantic model as a strict JSON schema, so pick
an OpenRouter model that supports structured outputs.

## Local MongoDB

[`docker-compose.yml`](docker-compose.yml) runs `mongodb/mongodb-atlas-local`,
not the plain `mongo` image. Only Atlas Local has the `$vectorSearch` and
`$search` operators that RAG needs. `make up` waits for the image's own health
check, which covers the search service too, so the database is ready for vector
queries as soon as the command returns.

| Command | What it does |
| --- | --- |
| `make up` / `make down` | Start or stop the database. Data is kept. |
| `make logs` | Follow the database logs. |
| `make mongo-shell` | Open `mongosh` inside the container. |
| `make mongo-reset` | **Delete all local data** (asks you to confirm). |

## Project layout

```text
backend/
├── main.py                     # python main.py == mentoragent serve
├── Dockerfile                  # multi-stage uv build, non-root runtime
├── docker-compose.yml          # MongoDB Atlas Local (+ API with --profile app)
├── data/extraction_metadata.json  # the mentors and their sources
├── src/mentoragent/
│   ├── api/                    # FastAPI app factory, routes, schemas, dependencies
│   ├── services/               # use cases: conversations, mentors, maintenance
│   ├── bootstrap.py            # composition root: builds models, graph, checkpointer
│   ├── cli.py                  # Typer CLI (`mentoragent`)
│   ├── workflow/               # LangGraph agent: state, prompts, chains, nodes, graph
│   ├── rag/                    # extractors, splitter, embeddings, retriever, memory
│   ├── db/                     # shared Mongo clients, repositories, search indexes
│   ├── models/                 # Pydantic domain models
│   ├── core/                   # settings, logging, exceptions, HTTP middleware
│   ├── infra/                  # Opik integration
│   └── evals/                  # dataset generation and Opik evaluation
└── tests/                      # pytest suite (fake LLM, in-memory checkpointer)
```

## Deployment

```bash
make docker-up     # builds the image and runs MongoDB + the API
```

The image runs `mentoragent serve` as a non-root user with JSON logs and a
`/health` healthcheck. In production set `ENVIRONMENT=prod` (hides the docs),
`API_KEY`, `LOG_JSON=true`, and point `MONGO_URI` at your Atlas cluster. Scale
with `mentoragent serve --workers N` or more replicas: the app is stateless,
all state lives in MongoDB.

## Project status

| Area | State |
| --- | --- |
| Settings, logging, exceptions, middleware | Done |
| Source extractors, dedup, long-term memory ingestion | Done |
| Hybrid retrieval scoped per mentor | Done |
| LangGraph agent with checkpointed conversations | Done |
| FastAPI app (REST + WebSocket streaming) | Done |
| CLI, Docker image | Done |
| Evaluation pipeline (Opik) | Done; needs `COMET_API_KEY` |
| Authentication beyond a shared API key, rate limiting | Not started |

## Conventions

Enforced by ruff and mypy; the notes explain the why.

- **`from __future__ import annotations`** starts every module (ruff adds it).
  Imports used only in annotations go under `if TYPE_CHECKING:`. Exception:
  types used in Pydantic fields or FastAPI route signatures must stay real
  imports, because those are evaluated at runtime.
- **Modern typing**: `list[str]`, `X | None`, `Self`; no `typing.List`/`Optional`.
- **Settings**: read through `settings.<group>.<FIELD>`. Secrets are `SecretStr`;
  call `.get_secret_value()` only where the key is handed to a client.
- **Logging**: `from loguru import logger`, with arguments rather than f-strings
  (`logger.info("Loaded {} docs", n)`). Use `logger.exception(...)` in `except`
  blocks so the traceback is kept. Call `configure_logging()` once at start-up.
- **Errors**: raise subclasses of `MentorAgentError`; each declares its
  `status_code`, and one handler maps them to HTTP responses. Never use
  `assert` for runtime checks.
- **No side effects at import**: no DB connections, graph compilation or API
  clients at module level. Build them in a factory (`build()`, `lru_cache`)
  or inject them through `__init__`.
- **MongoDB**: never create a `MongoClient` directly; use `get_mongo_client()`
  or `MongoRepository`, which share one connection pool.

## License

MIT
