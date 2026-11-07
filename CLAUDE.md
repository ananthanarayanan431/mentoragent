# MentorAgents

> Chat with AI mentors grounded in their published material. A FastAPI +
> LangGraph agent with RAG over MongoDB Atlas, and a React web app that streams
> replies over a WebSocket.

| Part         | Where                         | Port  | Agent notes                                                    |
| ------------ | ----------------------------- | ----- | -------------------------------------------------------------- |
| Mentor agent | `agents/mentor_agent`         | 8000  | [agents/mentor_agent/CLAUDE.md](agents/mentor_agent/CLAUDE.md) |
| Web app      | `web/`                        | 5173  | [web/CLAUDE.md](web/CLAUDE.md)                                 |
| API contract | `libs/mentor-agent-contracts` |       | [libs/README.md](libs/README.md)                               |
| MongoDB      | `infra/docker-compose.yml`    | 27017 | `make -C infra help`                                           |

Human-facing docs: [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md).

## Layout rules

- A Python service is an agent: `agents/<name>_agent/` with a flat package of the
  same name, its own `pyproject.toml`, `uv.lock`, `Dockerfile`, `Makefile`,
  `run.sh`, `.env.example` and `CLAUDE.md`. Lint, type and test rules live only
  in the root `pyproject.toml`; never add `[tool.ruff]`, `[tool.pyright]` or
  `[tool.pytest.ini_options]` to an agent.
- TypeScript lives in the pnpm workspace: `web/` and `libs/*`. Scripts run from
  the root `package.json`.
- Compose files live in `infra/`; every image builds from the repo root
  (`docker build -f <dir>/Dockerfile .`).
- An API change in an agent is not done until `make -C agents/<agent> openapi` has
  refreshed its contract in `libs/` (CI diffs it).

## Rules for every change

- **Commit on `main`** (this repo does not use branches or PRs for its own
  work). Commit early and often, one logical change per commit.
- **Conventional Commits**, enforced by `.githooks/commit-msg`:
  `<type>(<scope>): <imperative summary>`, at most 72 characters. Types: `feat`,
  `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`, `build`, `style`,
  `revert`. Scopes: `agent`, `web`, `infra`, `ci`, `deps`.
- **No em or en dashes and no AI attribution** in commit messages. The hook
  rejects the dashes and strips AI trailers.
- **Never skip hooks** (`--no-verify`). Activate them once per clone with
  `git config core.hooksPath .githooks`.
- **Run the gates before saying a change works**:
  `scripts/ci/python-checks.sh agents/mentor_agent all` and `pnpm check`.
  CI runs exactly these.
- Never commit `.env` files or secrets; only `.env.example` files are tracked.

## Commands

```bash
scripts/ci/python-checks.sh <agent-dir> [unit|audit|all]  # Python gate (ruff, pyright strict, pytest + coverage, pip-audit)
pnpm check                                                # web gate (prettier, oxlint, tsc, vitest, build)
pnpm format                                               # prettier --write over the repo
make -C infra up                                          # MongoDB
make -C infra stack-up                                    # MongoDB, agent and web app in Docker
```
