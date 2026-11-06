# Contributing

Thanks for taking a look. This file covers getting set up, the conventions each
half of the repo follows, and what CI checks before a change lands.

## Setup

Prerequisites: Docker with the Compose plugin, Python 3.12 with
[uv](https://docs.astral.sh/uv/), and Node 26.

```bash
cd backend
make install     # sync the virtualenv from uv.lock
make env         # create .env from .env.example, then fill in the keys
make hooks       # use the repo's git hooks in .githooks/
make up          # start MongoDB

cd ../frontend
npm install
```

`make help` in `backend/` lists every target.

## Before you push

Run the same checks CI runs:

```bash
cd backend  && make check
cd frontend && npm run lint && npm run typecheck && npm test -- --run && npm run build
```

CI runs both halves plus a Docker build of each image on every push and pull
request.

## Conventions

### Backend

Enforced by ruff and pyright (strict); the full reasoning is in
[backend/README.md](backend/README.md).

- Every module starts with `from __future__ import annotations`. Imports used
  only in annotations go under `if TYPE_CHECKING:` — except types used in
  Pydantic fields or FastAPI route signatures, which are evaluated at runtime.
- Modern typing only: `list[str]`, `X | None`, `Self`.
- Settings are read through `settings.<group>.<FIELD>`. Secrets are `SecretStr`.
- Log with loguru and arguments, not f-strings: `logger.info("Loaded {}", n)`.
  Use `logger.exception(...)` inside `except` blocks.
- Raise subclasses of `MentorAgentError`; never `assert` for runtime checks.
- No side effects at import: no DB connections or clients at module level.
- Never construct a `MongoClient` directly; use the shared helpers.

### Frontend

- **Colours are semantic.** Use `bg-canvas`, `text-muted`, `border-line` and
  friends, defined once per theme in `src/index.css`. No raw palette steps
  (`bg-zinc-800`) in components, so light and dark cannot drift apart.
- **Protocol logic stays pure.** The streaming state machine is a reducer in
  `src/lib/chat-state.ts`, tested without a DOM or a socket. Prefer adding to it
  over adding state to a component.
- **Wrap every `localStorage` access**; it throws in private windows and when
  site data is blocked, and the app must work without it.
- **Normalise errors** into `ApiError` with a message fit to show a user.
- Components stay small and live in `src/components/`, pages in `src/pages/`.

### Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). The
`commit-msg` hook in `.githooks/` rejects anything else:

```
<type>(<optional-scope>): <imperative summary, max 72 characters>

<optional body: what changed and why>
```

- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`,
  `build`, `style`, `revert`. Scopes are usually `backend`, `frontend`, `ci`
  or `deps`.
- Plain hyphens only: the hook rejects em and en dashes.
- No AI attribution: the hook strips `Co-Authored-By` lines for AI tools and
  "Generated with" footers.
- One logical change per commit; keep unrelated changes apart.

The `pre-commit` hook checks only the staged files: no private keys, nothing
over 1 MB, ruff on backend Python, prettier and oxlint on frontend files.
Never skip hooks with `--no-verify`; fix what they report.

## Reporting a security issue

Please do not open a public issue for a security problem. Email the maintainer
instead.
