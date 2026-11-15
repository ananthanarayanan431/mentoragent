# Task 02: Goal in the quest log

Phase 1 (spec step 1). Size: S. Depends on: 01.

## Goal

Let you write, see and change your goal from the square's quest log, so every
mentor can know it (once task 05 feeds it to them).

## Backend context

Uses only task 01: `GET /api/v1/goal` → `{goal: string | null}` and
`PUT /api/v1/goal` with `{goal}` (1 to 280 characters after trimming; 422
otherwise, with `{"errors": [{"body.goal": "..."}]}`). In production writes need
the `X-API-Key` header, which `lib/api.ts` already sends.

## Frontend context

- **API client.** Add `getGoal(signal?)` and `setGoal(goal)` to
  `web/src/lib/api.ts`, following `getMentor` / `updateMentor`: the `request<T>`
  helper turns every failure into an `ApiError` with a message fit to show.
  Types come from the contract (`web/src/lib/types.ts` re-exports them; never
  declare request or response shapes by hand).
- **Where it lives.** `QuestLog` in `web/src/features/world/menus.tsx` is the
  collapsible "Mentors met" panel in the top-left of the square. Add a "Your
  goal" section above the mentor list: the goal as text with an Edit button, or
  a "Set your goal" button when there is none. Editing shows a one-line input
  (max 280, with a counter like `features/chat/composer.tsx`), Save and Cancel.
- **Keyboard.** While the input has focus the game must not move the player:
  `world-page.tsx` sends `bridge.commands.emit('input', { enabled })`; disable
  game input while editing, the same way it is disabled while a dialogue is
  open. Space and arrow keys must type in the input (the game never captures
  keys; see `web/CLAUDE.md`).
- **Loading.** `world-page.tsx` loads the goal once on mount with an
  `AbortController` (see how it calls `getMentorPool`) and passes it to
  `QuestLog`. A failed load shows "Set your goal" (the goal is optional).
- **Copy.** Placeholder: "What do you want the mentors to help you with?"
- Colours are semantic tokens only (`bg-surface`, `text-muted`, `border-line`).

## Acceptance criteria

- [ ] With no goal, the quest log shows "Set your goal"; saving one shows it.
- [ ] Editing and saving updates the goal on the server; an error from the API
      is shown under the input and keeps the draft.
- [ ] Typing a goal (including spaces and arrows) never moves the player.

## Verification

- [ ] Vitest: `features/world/menus.test.tsx` (new) or the existing world tests,
      with `@/lib/api` mocked: set, edit, cancel, error, 280-character limit.
- [ ] `pnpm check` passes.
- [ ] By hand: `pnpm dev`, open the square, set a goal, reload, the goal is
      still there.

## Files likely touched

- `web/src/lib/api.ts`
- `web/src/features/world/menus.tsx`
- `web/src/features/world/world-page.tsx`
- `web/src/features/world/menus.test.tsx` (new)
