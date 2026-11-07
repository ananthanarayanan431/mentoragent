# MentorAgents web app

> React 19 + Vite single-page app: pick a mentor, then chat with replies
> streamed over a WebSocket. Detail: [README.md](README.md).

## Quick Reference

| Item     | Value                                                                              |
| -------- | ---------------------------------------------------------------------------------- |
| Package  | `@mentoragent/web` in the root pnpm workspace                                      |
| Dev      | `pnpm dev` on :5173 (proxies `/api` to the agent on :8000)                         |
| Node     | root `.nvmrc`; install with `pnpm install` at the root (`--frozen-lockfile` in CI) |
| Tests    | Vitest + Testing Library, jsdom                                                    |
| Lint     | oxlint (`.oxlintrc.json`); Prettier from the root `.prettierrc`                    |
| Contract | REST types from `@mentoragent/mentor-agent-contracts` (generated)                  |
| Serving  | nginx in Docker (`nginx.conf.template`, `security-headers.conf`)                   |

## Key Files

| File                                   | Purpose                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| `src/app/app.tsx`                      | Routes and the app shell                                    |
| `src/features/chat/chat-state.ts`      | Pure reducer for the streaming protocol (no DOM, no socket) |
| `src/features/chat/use-chat-socket.ts` | Socket lifecycle, reconnect with backoff                    |
| `src/features/chat/storage.ts`         | Per-mentor conversation persistence (wrapped localStorage)  |
| `src/lib/api.ts`                       | REST client; every failure becomes an `ApiError`            |
| `src/lib/types.ts`                     | REST types from the contract, WebSocket events, UI types    |
| `src/app/globals.css`                  | Semantic colour tokens for both themes                      |

## Rules

- Layout: `app/` is the shell, `components/` is UI shared by features,
  `features/<name>/` holds everything one feature needs (page, components, hooks,
  state, tests), `lib/` is framework-free helpers. File names are kebab-case.
- Imports across folders use `@/` (`src/`); imports within a folder stay relative.
- Never declare REST request or response shapes by hand: import them from the
  contract. If the agent's API changes, run `make -C agents/mentor_agent openapi`.
- Colours are semantic tokens (`bg-canvas`, `text-muted`, `border-line`). No
  raw palette steps such as `bg-zinc-800` in components.
- Protocol logic goes in the `chat-state.ts` reducer and is tested there, not
  as component state.
- Wrap every `localStorage` access; the app must work when it throws.
- Normalise errors into `ApiError` with a message fit to show a user.

## Commands

```bash
pnpm install        # at the repo root
pnpm dev            # dev server (or ./run.sh, make dev, here)
pnpm format         # prettier --write over the repo
pnpm check          # everything CI runs: format, lint, typecheck, test, build
make docker-up      # the nginx image on the infra network
```
