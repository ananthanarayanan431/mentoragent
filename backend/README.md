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
make up        # start MongoDB Atlas Local and wait until it is healthy
make run       # run main.py
```

Run `make` with no arguments to list every target.

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
└── src/mentoragent/
    ├── core/
    │   ├── config/             # settings, one class per concern
    │   ├── exceptions.py       # domain exceptions
    │   ├── handlers.py         # FastAPI middleware and exception handlers
    │   └── logging.py          # contextual logger
    ├── db/
    │   ├── client.py           # typed MongoDB wrapper (Pydantic in and out)
    │   └── indexes.py          # vector and full-text index creation
    ├── models/                 # Mentor, MentorExtract, evaluation schemas
    ├── rag/
    │   ├── extractors/         # PDF, Wikipedia, YouTube, Twitter loaders
    │   └── memory/             # build and query long-term memory
    ├── workflow/
    │   └── model.py            # async OpenRouter client
    └── evals/                  # dataset generation and Opik evaluation
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
| `rag.retrievers`, `rag.splitters`, `rag.extractor`, `rag.deduplicate_documents` | Not started |
| LangGraph agent (`workflow.graph`, `workflow.state`, `workflow.prompt`) | Not started |
| FastAPI app (`mentoragent.api.main`, used by `make serve`) | Not started |
| Evaluation pipeline | Written; depends on the agent graph |

## License

MIT
