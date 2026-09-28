# MentorAgents — backend

> Where human expertise meets AI.

MentorAgents lets you chat with AI mentors modelled on real experts. Each mentor
has a name, area of expertise, perspective and speaking style, and answers from
a long-term memory built out of that person's public material: PDFs, Wikipedia,
YouTube transcripts and tweets.

> **Status: work in progress.** Configuration, the LLM client, MongoDB access,
> data models and the source extractors are in place. The agent graph, the
> retriever and the FastAPI app are not written yet, so there is no HTTP API to
> call. See [Project status](#project-status).

## Tech stack

| Concern | Choice |
| --- | --- |
| Language / packaging | Python 3.12, [uv](https://docs.astral.sh/uv/) |
| LLM calls | `openai` SDK (async) pointed at [OpenRouter](https://openrouter.ai) |
| Database & vector search | MongoDB Atlas Local 8.0 (Docker) |
| RAG plumbing | LangChain loaders, splitters and `langchain-mongodb` |
| Agent orchestration | LangGraph with MongoDB checkpoints (planned) |
| Tweets | [Arcade](https://arcade.dev) `X.SearchRecentTweetsByUsername` |
| Evaluation | [Opik](https://www.comet.com/site/products/opik/) |
| API | FastAPI + Uvicorn (planned) |

## Quick start

Prerequisites: Python 3.12, `uv`, and Docker with the Compose plugin.

```bash
cd backend
make install   # uv sync — create .venv from uv.lock
make env       # copy .env.example to .env (never overwrites an existing .env)
# now fill in the API keys in .env
make hooks     # install the pre-commit hooks (ruff lint + format)
make up        # start MongoDB Atlas Local and wait until it is healthy
make run       # run main.py
```

Run `make` with no arguments to list every target.

## Development

| Command | What it does |
| --- | --- |
| `make format` | Auto-fix lint issues and format the code |
| `make lint` | Lint with ruff |
| `make typecheck` | Type-check with mypy |
| `make test` | Run the pytest suite (no network or database needed) |
| `make check` | All of the above; what CI should run |

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

Keys you must set before `Settings()` will load:

| Variable | Used for |
| --- | --- |
| `OPENROUTER_API_KEY` | Chat completions via OpenRouter |
| `OPENAI_API_KEY` | Embeddings and evaluation |
| `GROQ_API_KEY` | Groq models (legacy LangChain paths) |
| `ARCADE_API_KEY`, `ARCADE_USER_ID` | Fetching tweets |
| `LANGSMITH_API_KEY` | Tracing |

Every other variable has a default. [`.env.example`](.env.example) lists them all.

> `RAG_TEXT_EMBEDDING_MODEL_DIM` must match `numDimensions` on the Atlas vector
> search index, or every query fails.

## Calling the LLM

`Models` in [`workflow/model.py`](src/mentoragent/workflow/model.py) is a thin
async wrapper around the OpenAI SDK, pointed at OpenRouter. It does not use
LangChain.

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
├── main.py                     # placeholder entrypoint (make run)
├── docker-compose.yml          # MongoDB Atlas Local
├── Makefile
├── src/mentoragent/
│   ├── core/
│   │   ├── config/             # settings, one class per concern
│   │   ├── exceptions.py       # domain exceptions
│   │   ├── handlers.py         # FastAPI middleware and exception handlers
│   │   └── logging.py          # loguru setup (configure_logging)
│   ├── db/
│   │   ├── client.py           # shared MongoClient + typed MongoRepository
│   │   └── indexes.py          # idempotent vector and full-text index creation
│   ├── models/                 # Mentor, MentorExtract, evaluation schemas
│   ├── rag/
│   │   ├── extractors/         # PDF, Wikipedia, YouTube, Twitter loaders
│   │   ├── extractor.py        # runs every extractor for every mentor
│   │   ├── deduplicate_documents.py  # MinHash near-duplicate removal
│   │   └── memory/             # build and query long-term memory
│   ├── workflow/
│   │   └── model.py            # async OpenRouter client
│   └── evals/                  # dataset generation and Opik evaluation
└── tests/                      # pytest suite
```

## Project status

| Area | State |
| --- | --- |
| Settings, logging, exceptions | Done |
| Async OpenRouter client (text, streaming, structured output) | Done |
| MongoDB client and index helper | Done |
| Data models | Done |
| Source extractors (PDF, Wikipedia, YouTube, Twitter) | Done |
| Long-term memory creator and retriever | Written; depends on the missing modules below |
| `rag.extractor`, `rag.deduplicate_documents` | Done |
| `rag.retrievers`, `rag.splitters`, `rag.embeddings` | In progress |
| LangGraph agent (`workflow.graph`, `workflow.state`, `workflow.prompt`) | Not started |
| FastAPI app (`mentoragent.api.main`, used by `make serve`) | Not started |
| Evaluation pipeline | Written; depends on the agent graph |

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
