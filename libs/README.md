# libs/

Shared TypeScript packages in the pnpm workspace. Each folder is its own package
that `web/` (or a later TypeScript app) depends on with `"workspace:*"`.

## Contracts

`<agent>-contracts` packages hold an agent's API contract:

- `openapi.json`: the agent's OpenAPI document, exported by the agent
  (`make -C agents/<agent> openapi`). Committed, so a review shows every API change.
- `src/schema.d.ts`: TypeScript types generated from it (`pnpm generate`). Never
  edit it by hand.
- `src/index.ts`: friendly names for the shapes the web app uses.

CI exports the OpenAPI document again and fails if it differs from the snapshot, or
if `schema.d.ts` is stale. Change the agent, run `make openapi`, commit both files.
