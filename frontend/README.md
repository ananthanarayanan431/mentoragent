# MentorAgents — frontend

React single-page app for chatting with the mentors served by
[`backend/`](../backend). Replies stream in token by token over a WebSocket.

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

Prerequisites: Node 26 (see [`.nvmrc`](.nvmrc)) and a backend running on
port 8000 — start it with `make run` in [`backend/`](../backend).

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

The dev server proxies `/api`, `/health` and `/ready` to `localhost:8000`,
including the WebSocket upgrade, so the browser stays on one origin and no CORS
configuration is needed. Point it elsewhere with `VITE_DEV_BACKEND`.

## Scripts

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                            |
| `npm run build`     | Type-check, then build to `dist/`                     |
| `npm run preview`   | Serve the built bundle                                |
| `npm test`          | Vitest (watch mode; `npm test -- --run` for one pass) |
| `npm run lint`      | Lint with oxlint                                      |
| `npm run typecheck` | Type-check without emitting                           |
| `npm run format`    | Format with Prettier                                  |

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
docker build -t mentoragent-frontend .
docker run -p 8080:8080 -e BACKEND_HOST=host.docker.internal:8000 mentoragent-frontend
```

The image builds the bundle with Node, then serves it from
`nginx-unprivileged` (non-root, port 8080). nginx also reverse-proxies `/api`,
`/health` and `/ready` to `BACKEND_HOST`, which is why `VITE_API_URL` can stay
empty in production. Streaming responses are unbuffered so tokens are not
batched, and WebSocket upgrades are passed through.

From the repository root, `docker compose up` runs the whole stack.

## Project layout

```text
frontend/
├── Dockerfile               # build with node, serve with nginx
├── nginx.conf.template      # SPA fallback, caching, API proxy
├── security-headers.conf    # included by every location that sets a header
├── index.html               # pre-paint theme script lives here
└── src/
    ├── components/          # Avatar, Header, MentorCard, state views
    │   └── chat/            # composer, message list, bubbles, connection badge
    ├── hooks/
    │   ├── useChatSocket.ts # socket lifecycle, reconnect, backoff
    │   └── useTheme.ts      # light / dark / system
    ├── lib/
    │   ├── api.ts           # typed client, error normalisation
    │   ├── chat-state.ts    # pure reducer for the streaming protocol
    │   ├── config.ts        # env, URL building
    │   └── storage.ts       # per-mentor conversation persistence
    ├── pages/               # MentorsPage, ChatPage, NotFoundPage
    └── types.ts             # shapes shared with the backend
```

## Conventions

- **Colours are semantic.** Components use `bg-canvas`, `text-muted`,
  `border-line` and friends, defined once per theme in
  [`src/index.css`](src/index.css). No raw palette steps (`bg-zinc-800`) in
  components, so the two themes cannot drift apart.
- **Protocol logic stays pure.** The streaming state machine lives in
  `chat-state.ts` as a reducer, tested without a DOM or a socket.
- **Every `localStorage` access is wrapped**, because it throws in private
  windows and when site data is blocked. The app works without it.
- **Errors are normalised** into `ApiError` with a message fit to show a user;
  FastAPI's `detail` list is flattened to one line.
