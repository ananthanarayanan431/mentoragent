# MentorAgents

> Chat with AI mentors grounded in their published material. A FastAPI +
> LangGraph backend with RAG over MongoDB Atlas, and a React frontend that
> streams replies over a WebSocket.

| Part    | Where       | Port  | Agent notes                              |
| ------- | ----------- | ----- | ---------------------------------------- |
| API     | `backend/`  | 8000  | [backend/CLAUDE.md](backend/CLAUDE.md)   |
| Web app | `frontend/` | 5173  | [frontend/CLAUDE.md](frontend/CLAUDE.md) |
| MongoDB | compose     | 27017 | `backend/docker-compose.yml`             |

Human-facing docs: [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md).

## Rules for every change

- **Commit on `main`** (this repo does not use branches or PRs for its own
  work). Commit early and often, one logical change per commit.
- **Conventional Commits**, enforced by `.githooks/commit-msg`:
  `<type>(<scope>): <imperative summary>`, at most 72 characters. Types: `feat`,
  `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`, `build`, `style`,
  `revert`. Scopes: `backend`, `frontend`, `ci`, `deps`.
- **No em or en dashes and no AI attribution** in commit messages. The hook
  rejects the dashes and strips AI trailers.
- **Never skip hooks** (`--no-verify`). Activate them once per clone with
  `git config core.hooksPath .githooks` (or `make -C backend hooks`).
- **Run the gate before saying a change works**:
  `scripts/ci/python-checks.sh all` and `scripts/ci/frontend-checks.sh all`.
  CI runs exactly these scripts.
- Never commit `.env` files or secrets; only `.env.example` is tracked.

## Commands

```bash
scripts/ci/python-checks.sh [unit|audit|all]    # backend gate (ruff, pyright strict, pytest + coverage, pip-audit)
scripts/ci/frontend-checks.sh [unit|audit|all]  # frontend gate (prettier, oxlint, tsc, vitest, build, npm audit)
docker compose --profile app up --build         # whole stack in containers
```
