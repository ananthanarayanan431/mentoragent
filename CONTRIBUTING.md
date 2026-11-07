# Contributing

Thanks for taking a look. This file covers getting set up, the conventions each
part of the repo follows, and what CI checks before a change lands.

## Setup

Prerequisites: Docker with the Compose plugin, [uv](https://docs.astral.sh/uv/)
(it installs the Python in `.python-version`), and Node (`.nvmrc`) with pnpm 10.

```bash
git config core.hooksPath .githooks         # the repo's commit-msg and pre-commit hooks
cp infra/.env.example infra/.env            # MongoDB credentials
make -C infra up                            # start MongoDB
make -C agents/mentor_agent install env     # agent venv and .env (fill in the keys)
pnpm install                                # web app and libs
```

`make` in `infra/`, `agents/mentor_agent/` and `web/` lists each folder's shortcuts.

## Where things go

| You are adding...                 | It goes in                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| A Python service                  | `agents/<name>_agent/`, laid out like `agents/mentor_agent`                                 |
| An agent route / its request body | `routes/v1/<area>.py` / `schemas/v1/<area>.py`                                              |
| An agent setting                  | `config/<group>.py`, read as `settings.<group>.<FIELD>`                                     |
| A web feature                     | `web/src/features/<name>/` (page, components, hooks, tests)                                 |
| Something in Mentor Square        | `web/src/features/world/`: logic in `game/*.ts` with tests, Phaser in `game/world-scene.ts` |
| UI shared by features             | `web/src/components/`                                                                       |
| A framework-free web helper       | `web/src/lib/`                                                                              |
| Shared TypeScript code            | `libs/<name>/`, a workspace package                                                         |
| A container or compose service    | `infra/` (images build from the repo root)                                                  |

## Before you push

Run the same checks CI runs, from the repo root:

```bash
scripts/ci/python-checks.sh agents/mentor_agent all   # ruff, pyright strict, pytest + coverage floor, pip-audit
pnpm check                                            # prettier, oxlint, tsc, vitest, build
```

CI runs exactly these, plus the API contract check, `pnpm audit`, the compose
files and a Docker build of every image. On pull requests CI skips the areas a
change does not touch; pushes to `main` always run everything.

- **API contract**: after changing an agent's routes or schemas, run
  `make -C agents/mentor_agent openapi` and commit `libs/mentor-agent-contracts`.
  CI fails if the committed contract is stale.
- **Coverage** must stay at or above the floor in the agent's `pyproject.toml`
  (`[tool.coverage.report] fail_under`). Raise it when coverage grows; never
  lower it.
- **Dependency audits are blocking.** Fix a finding by upgrading the package.
  If no fix can be installed, add the advisory to `AUDIT_IGNORES` in
  `scripts/ci/python-checks.sh` with the reason and the date.

## Conventions

### Python agents

Enforced by ruff and pyright (strict), configured once in the root
`pyproject.toml`; the full reasoning is in
[agents/mentor_agent/README.md](agents/mentor_agent/README.md).

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

### Web app

- **Layout.** `src/app/` is the shell, `src/components/` holds UI shared by
  features, `src/features/<name>/` holds everything one feature needs, and
  `src/lib/` holds framework-free helpers. File names are kebab-case; imports
  across folders use `@/`.
- **REST types come from the contract** (`@mentoragent/mentor-agent-contracts`),
  never declared by hand.
- **Colours are semantic.** Use `bg-canvas`, `text-muted`, `border-line` and
  friends, defined once per theme in `src/app/globals.css`. No raw palette steps
  (`bg-zinc-800`) in components, so light and dark cannot drift apart.
- **Protocol logic stays pure.** The streaming state machine is a reducer in
  `src/features/chat/chat-state.ts`, tested without a DOM or a socket. Prefer adding to it
  over adding state to a component.
- **Wrap every `localStorage` access**; it throws in private windows and when
  site data is blocked, and the app must work without it.
- **Normalise errors** into `ApiError` with a message fit to show a user.
- **Lint is oxlint** with the `correctness`, `suspicious` and `perf`
  categories as errors (`.oxlintrc.json`); `--deny-warnings` in the hook.
  Deliberately off: `react-in-jsx-scope` (the automatic JSX runtime makes it
  obsolete), `exhaustive-effect-dependencies` (it flags intentional trigger
  dependencies; `react/exhaustive-deps` stays on), `prefer-tag-over-role`
  (`role="status"` is the right live region, `<output>` is for form results)
  and `prefer-add-event-listener` (each socket is private to its hook and has
  exactly one handler per event).

### Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). The
`commit-msg` hook in `.githooks/` rejects anything else:

```
<type>(<optional-scope>): <imperative summary, max 72 characters>

<optional body: what changed and why>
```

- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`,
  `build`, `style`, `revert`. Scopes are usually `agent`, `web`, `infra`, `ci`
  or `deps`.
- Plain hyphens only: the hook rejects em and en dashes.
- No AI attribution: the hook strips `Co-Authored-By` lines for AI tools and
  "Generated with" footers.
- One logical change per commit; keep unrelated changes apart.

The `pre-commit` hook checks only the staged files: no private keys, nothing
over 1 MB, ruff on each agent's Python, Prettier on every file it understands,
and oxlint on web code.
Never skip hooks with `--no-verify`; fix what they report.

## Reporting a security issue

Please do not open a public issue for a security problem. Email the maintainer
instead.
