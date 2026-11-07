# MentorAgents frontend

> React 19 + Vite single-page app: pick a mentor, then chat with replies
> streamed over a WebSocket. Detail: [README.md](README.md).

## Quick Reference

| Item    | Value                                                            |
| ------- | ---------------------------------------------------------------- |
| Dev     | `npm run dev` on :5173 (proxies `/api` to the backend)           |
| Node    | `.nvmrc`; install with `npm ci`, never `npm install` in CI       |
| Tests   | Vitest + Testing Library, jsdom                                  |
| Lint    | oxlint (`.oxlintrc.json`), Prettier (`.prettierrc.json`)         |
| Serving | nginx in Docker (`nginx.conf.template`, `security-headers.conf`) |

## Key Files

| File                         | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `src/lib/chat-state.ts`      | Pure reducer for the streaming protocol (no DOM, no socket) |
| `src/hooks/useChatSocket.ts` | Socket lifecycle, reconnect with backoff                    |
| `src/lib/api.ts`             | Typed REST client; every failure becomes an `ApiError`      |
| `src/lib/storage.ts`         | Per-mentor conversation persistence (wrapped localStorage)  |
| `src/types.ts`               | Shapes shared with the backend                              |
| `src/index.css`              | Semantic colour tokens for both themes                      |

## Rules

- Colours are semantic tokens (`bg-canvas`, `text-muted`, `border-line`). No
  raw palette steps such as `bg-zinc-800` in components.
- Protocol logic goes in the `chat-state.ts` reducer and is tested there, not
  as component state.
- Wrap every `localStorage` access; the app must work when it throws.
- Normalise errors into `ApiError` with a message fit to show a user.
- Components stay small: `src/components/`, pages in `src/pages/`.
- Keep `src/types.ts` in step with the backend schemas
  (`backend/src/mentoragent/api/schemas.py`).

## Commands

```bash
npm ci                                  # install exactly what the lockfile pins
npm run dev                             # dev server
npm run format                          # prettier --write
npm test -- --run                       # one test pass (plain `npm test` watches)
../scripts/ci/frontend-checks.sh all    # everything CI runs
```
