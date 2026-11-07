# MentorAgents web app

React single-page app for chatting with the mentors served by
[`agents/mentor_agent`](../agents/mentor_agent). Replies stream in token by token over a WebSocket.

## Tech stack

| Concern       | Choice                                |
| ------------- | ------------------------------------- |
| Framework     | React 19 + TypeScript (strict)        |
| Build         | Vite 8                                |
| Styling       | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Routing       | React Router v8 (library mode)        |
| Markdown      | `react-markdown` + `remark-gfm`       |
| Icons         | `lucide-react`                        |
| Tests         | Vitest + Testing Library              |
| Lint / format | oxlint + Prettier                     |

## Quick start

Prerequisites: Node (see the root [`.nvmrc`](../.nvmrc)), pnpm 10, and the agent
running on port 8000 (`agents/mentor_agent/run.sh`).

```bash
pnpm install     # at the repo root: installs the whole workspace
pnpm dev         # http://localhost:5173 (or ./run.sh, make dev, in this folder)
```

REST types come from the agent's OpenAPI contract in
[`libs/mentor-agent-contracts`](../libs/mentor-agent-contracts), so a backend
change that breaks the web app fails type-checking.

The dev server proxies `/api`, `/health` and `/ready` to `localhost:8000`,
including the WebSocket upgrade, so the browser stays on one origin and no CORS
configuration is needed. Point it elsewhere with `VITE_DEV_BACKEND`.

## Scripts

| Command (repo root) | What it does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`          | Dev server with hot reload                                              |
| `pnpm build`        | Type-check, then build to `web/dist/`                                   |
| `pnpm test`         | Vitest, one pass (`pnpm --filter @mentoragent/web test:watch` to watch) |
| `pnpm lint`         | Lint with oxlint                                                        |
| `pnpm typecheck`    | Type-check without emitting                                             |
| `pnpm format`       | Format the repo with Prettier                                           |
| `pnpm check`        | Everything CI runs                                                      |

## Configuration

Copy [`.env.example`](.env.example) to `.env.local`. Both variables are
optional and both are **baked into the bundle at build time**, so neither can
hold a real secret.

| Variable       | Meaning                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `VITE_API_URL` | API base URL. Empty (the default) means the app's own origin.                                          |
| `VITE_API_KEY` | Sent as `X-API-Key`, and as `?api_key=` on the WebSocket. Only needed when the backend sets `API_KEY`. |

## How the chat works

1. `GET /api/v1/mentors` fills the landing page.
2. Opening a mentor connects to `WS /api/v1/ws/chat`.
3. Each turn sends `{mentor_id, message, conversation_id?}` and receives
   `start` → `chunk`* → `end`, or `error`.
4. `conversation_id` comes back on `start` and is sent with the next message to
   continue the thread. It is kept in `localStorage` per mentor, so a reload
   resumes.
5. If the socket cannot connect, messages fall back to `POST /api/v1/chat`,
   which returns the whole reply at once.
6. **New chat** calls `DELETE /api/v1/conversations/{mentor}/{id}` and clears
   the stored thread.

The socket reconnects with exponential backoff and gives up after six
attempts, at which point the connection badge offers a manual retry.

## Docker

```bash
make docker-up          # in this folder: build and run on the infra network
# or, from the repo root, standalone:
docker build -f web/Dockerfile -t mentoragent-web .
docker run -p 8080:8080 -e BACKEND_HOST=host.docker.internal:8000 mentoragent-web
```

The image builds the bundle with Node and pnpm from the repo root, then serves it from
`nginx-unprivileged` (non-root, port 8080). nginx also reverse-proxies `/api`,
`/health` and `/ready` to `BACKEND_HOST`, which is why `VITE_API_URL` can stay
empty in production. Streaming responses are unbuffered so tokens are not
batched, and WebSocket upgrades are passed through.

From the repository root, `make -C infra stack-up` runs the whole stack.

## Project layout

```text
web/
├── Dockerfile               # pnpm build from the repo root, serve with nginx
├── Makefile, run.sh         # dev, build, preview, docker up/down/logs/ps
├── nginx.conf.template      # SPA fallback, caching, API proxy
├── security-headers.conf    # included by every location that sets a header
├── index.html               # pre-paint theme script lives here
└── src/
    ├── app/                 # shell: app.tsx (routes), main.tsx, globals.css, not-found page
    ├── components/          # shared UI: avatar, header, error boundary, state views, theme toggle
    ├── features/
    │   ├── chat/            # chat page and components, socket hook, streaming reducer, storage
    │   └── mentors/         # mentors page and card
    ├── lib/                 # api client, config, types (from the contract), theme hook
    └── test/                # Vitest setup
```

File names are kebab-case; imports across folders use the `@/` alias (`src/`),
imports within a folder stay relative.

## Conventions

- **Colours are semantic.** Components use `bg-canvas`, `text-muted`,
  `border-line` and friends, defined once per theme in
  [`src/app/globals.css`](src/app/globals.css). No raw palette steps (`bg-zinc-800`) in
  components, so the two themes cannot drift apart.
- **Protocol logic stays pure.** The streaming state machine lives in
  `chat-state.ts` as a reducer, tested without a DOM or a socket.
- **Every `localStorage` access is wrapped**, because it throws in private
  windows and when site data is blocked. The app works without it.
- **Errors are normalised** into `ApiError` with a message fit to show a user;
  FastAPI's `detail` list is flattened to one line.
