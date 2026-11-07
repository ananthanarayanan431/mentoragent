# e2e-tests

Playwright end-to-end tests for the web app, run against the Docker stack. They
drive the real game (Phaser in a browser) and the real agent API, and fail on any
console error. Nothing here sends a chat message, so no model is called.

```bash
cp infra/.env.example infra/.env                                   # once
make -C infra stack-up                                             # MongoDB, agent, web on :8080
docker exec mentoragent-mentor-agent-api mentor-agent load-mentors # the mentors
pnpm e2e                                                           # all projects
pnpm e2e -- --project=phone                                        # one project
```

| Project   | Viewport         | Covers                                                     |
| --------- | ---------------- | ---------------------------------------------------------- |
| `desktop` | 1280 x 800, keys | Walking, talking, Escape, pause, labels, classic view, axe |
| `phone`   | Pixel 7, touch   | Touch hint, compact quest log, tap a mentor to talk        |

Locally the tests drive the installed Chrome (`channel: 'chrome'`); CI installs
Playwright's Chromium. `E2E_BASE_URL` points them at another server (for example
the Vite dev server on :5173).

`support/world.ts` imports the real map, so taps follow the layout if it changes,
and its `test` fails any test that logs a console error.
