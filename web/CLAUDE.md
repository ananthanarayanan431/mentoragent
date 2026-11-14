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

| File                                           | Purpose                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `src/app/app.tsx`                              | Routes: `/` the square, `/mentors` the list, `/chat/:id`                |
| `src/features/world/world-page.tsx`            | Mentor Square: loads Phaser lazily, owns every menu                     |
| `src/features/world/world-bridge.ts`           | Typed events/commands: the only link to the game                        |
| `src/features/world/game/`                     | The game: map, wandering, appearance, art, Phaser scene                 |
| `src/features/world/progress.ts`               | Friendship levels per mentor (stored per browser)                       |
| `src/features/mentors/mentor-editor.tsx`       | Edit a mentor's persona and sources; rebuild their memory               |
| `src/features/mentors/create-mentor-form.tsx`  | Create a mentor from links and pasted posts (`create-mentor.ts`: pure)  |
| `src/features/chat/use-mentor-conversation.ts` | One conversation (socket, reducer, storage); chat page and dialogue box |
| `src/features/chat/chat-state.ts`              | Pure reducer for the streaming protocol (no DOM, no socket)             |
| `src/features/chat/use-chat-socket.ts`         | Socket lifecycle, reconnect with backoff                                |
| `src/features/chat/storage.ts`                 | Per-mentor conversation persistence (wrapped localStorage)              |
| `src/lib/api.ts`                               | REST client; every failure becomes an `ApiError`                        |
| `src/lib/types.ts`                             | REST types from the contract, WebSocket events, UI types                |
| `src/app/globals.css`                          | Semantic colour tokens for both themes                                  |

## Rules

- The game: Phaser code lives only in `features/world/game/` (`world-scene.ts`,
  `create-game.ts`, `art.ts`) and is imported only through the lazy
  `import('./game/create-game')`. Decisions (map, wandering, who is in reach,
  appearance) go in pure modules with unit tests; the scene draws and moves.
  Menus and the dialogue are React; the two sides talk only through the bridge.
- The game never captures keys: Space and the arrows must keep working in the
  dialogue's text box. React disables game input while a menu or dialogue is open.
- All game art is drawn in code (`art.ts`) at `ART_SCALE` (2x) and shown at half
  size; keep main shapes on a 2px grid. Do not add art from other games or packs;
  a new mentor gets a sprite from `appearanceFor(id)` automatically.
- Mentors join during play through the bridge (`addMentor`), never by rebuilding
  the game; `mentorSpawnSpots` has room for any number of them.
- No side effects inside React state updaters (they must stay pure).

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
