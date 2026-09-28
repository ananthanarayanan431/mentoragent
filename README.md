<div align="center">

# MentorAgents

**Where human expertise meets AI.**

Chat with AI mentors modelled on real experts. Each mentor answers from a
long-term memory built out of that person's own public work.

[![CI](https://github.com/ananthanarayanan431/mentoragent/actions/workflows/ci.yml/badge.svg)](https://github.com/ananthanarayanan431/mentoragent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](backend/.python-version)
[![React 19](https://img.shields.io/badge/react-19-61dafb.svg)](frontend/package.json)

</div>

---

## What it is

A mentor is a name, an area of expertise, a perspective and a speaking style.
Behind each one sits a retrieval-augmented agent: the person's PDFs, Wikipedia
pages, YouTube transcripts and tweets are extracted, de-duplicated, embedded and
stored in MongoDB Atlas, then retrieved as context when you ask a question.
Replies stream back token by token.

```text
                  ┌──────────────────────────────────────────┐
  Browser ───────▶│  frontend/   React 19 · Vite · Tailwind   │
   :8080          └───────────────────┬──────────────────────┘
                     REST + WebSocket │  (nginx proxies /api in production)
                  ┌───────────────────▼──────────────────────┐
                  │  backend/    FastAPI · LangGraph agent    │
                  │              ├── retrieval (RAG)          │
                  │              ├── short-term memory        │
                  │              └── long-term memory         │
                  └───────────────────┬──────────────────────┘
                  ┌───────────────────▼──────────────────────┐
                  │  MongoDB Atlas Local                      │
                  │  documents · vector index · checkpoints   │
                  └──────────────────────────────────────────┘

  Ingestion:  PDFs · Wikipedia · YouTube · X  ──▶  split ──▶ embed ──▶ Atlas
```

| Layer | Stack |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4 |
| API | FastAPI, Uvicorn, WebSocket streaming |
| Agent | LangGraph with MongoDB checkpoints |
| LLM | OpenRouter (OpenAI SDK), Groq |
| Retrieval | LangChain splitters, OpenAI embeddings, MongoDB Atlas vector search |
| Storage | MongoDB Atlas Local 8.0 |
| Evaluation | Opik |

## Quick start

Prerequisites: **Docker** with the Compose plugin, **Python 3.12** with
[uv](https://docs.astral.sh/uv/), and **Node 26**.

```bash
git clone https://github.com/ananthanarayanan431/mentoragent.git
cd mentoragent

# 1. Configure — fill in the API keys the backend needs
cd backend && make env && $EDITOR .env

# 2. Start MongoDB and the API (http://localhost:8000/docs)
make install
make seed        # first run only: load mentors, build long-term memory
make serve

# 3. In a second terminal, start the web app (http://localhost:5173)
cd ../frontend && npm install && npm run dev
```

The dev server proxies `/api` to port 8000, including the WebSocket, so there
is no CORS setup to do.

### Or run the whole stack in Docker

```bash
cp backend/.env.example backend/.env   # then fill in the keys
docker compose --profile app up --build
```

The app is then on <http://localhost:8080>, with nginx proxying `/api` to the
API container, so both run on one origin.

### Required keys

`make env` copies [`backend/.env.example`](backend/.env.example), which
documents every variable. These have no default and must be filled in:

| Variable | Used for |
| --- | --- |
| `OPENROUTER_API_KEY` | Chat completions |
| `OPENAI_API_KEY` | Embeddings and evaluation |
| `GROQ_API_KEY` | Groq models |
| `ARCADE_API_KEY`, `ARCADE_USER_ID` | Fetching tweets |
| `LANGSMITH_API_KEY` | Tracing |

`.env` is gitignored. Only the example file is committed.

## Repository layout

```text
mentoragent/
├── backend/              # FastAPI service, LangGraph agent, RAG pipeline
│   ├── src/mentoragent/  # the package (src layout)
│   ├── tests/
│   ├── Dockerfile
│   ├── docker-compose.yml   # MongoDB + api + web
│   └── Makefile          # make help lists every target
├── frontend/             # React single-page app
│   ├── src/
│   ├── Dockerfile        # build with Node, serve with nginx
│   └── nginx.conf.template
├── docker-compose.yml    # includes backend/docker-compose.yml
└── .github/workflows/    # CI for both halves
```

Each half has its own README with the detail:
**[backend/README.md](backend/README.md)** ·
**[frontend/README.md](frontend/README.md)**

## Development

| | Backend (`cd backend`) | Frontend (`cd frontend`) |
| --- | --- | --- |
| Install | `make install` | `npm install` |
| Run | `make serve` | `npm run dev` |
| Lint | `make lint` | `npm run lint` |
| Types | `make typecheck` | `npm run typecheck` |
| Test | `make test` | `npm test` |
| Everything CI runs | `make check` | `npm run lint && npm run typecheck && npm test -- --run && npm run build` |

`make help` in `backend/` lists every target, including the data pipeline
(`make seed`, `make load-mentors`, `make create-memory`) and evaluation
(`make evaluate`).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the conventions each half
follows, and what CI checks before a change lands.

## License

[MIT](LICENSE).

Mentor replies are generated by a language model drawing on published material.
They are not the words of the people the mentors are modelled on, and should
not be presented as such.
