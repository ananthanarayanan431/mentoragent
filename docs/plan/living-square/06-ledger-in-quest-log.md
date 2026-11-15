# Task 06: Ledger in the quest log

Phase 1 (spec step 1). Size: S. Depends on: 02, 04.

## Goal

Show who told you what in the quest log, and let you delete a line the summary
got wrong, so a mistake is not repeated by every mentor.

## Backend context

Uses task 04: `GET /api/v1/ledger?limit=50` → `[{id, mentor_id, mentor_name,
topic, advice, created_at}]` newest first; `DELETE /api/v1/ledger/{id}` → 204,
404 when already gone (treat 404 as success: the line is gone either way).

## Frontend context

- **API client.** `listLedger(signal?)` and `deleteLedgerLine(id)` in
  `web/src/lib/api.ts`, types from the contract.
- **Shared state.** The ledger is needed by the quest log (here) and by speech
  bubbles (task 09), so load it in `world-page.tsx` (`World` component), keep it
  in state, and refresh it when a dialogue closes (the ledger line is written
  just after a reply; refresh after a short delay, about 2 seconds, or refresh
  again on the next close). A small `useLedger()` hook in
  `features/world/use-ledger.ts` keeps `world-page.tsx` from growing.
- **UI.** In `QuestLog` (`features/world/menus.tsx`), under the goal from task
  02, a "What they told you" list: the 10 newest lines as
  `Mentor · topic` with the advice as the second line, and a small delete icon
  button (lucide `X`, `aria-label="Forget this advice from {mentor}"`). Deleting
  removes the line at once (optimistic) and puts it back with an error message
  if the request fails. Empty state: "Talk to a mentor; their advice shows up
  here."
- **Keyboard.** The list is inside the quest log panel, which already opens and
  closes; buttons must be reachable with Tab.

## Acceptance criteria

- [ ] The quest log lists the newest ledger lines with mentor, topic and advice.
- [ ] Deleting a line removes it from the list and from the server; a failure
      restores it and says why.
- [ ] After closing a dialogue in which a mentor gave advice, the new line shows
      up without reloading the page.

## Verification

- [ ] Vitest with `@/lib/api` mocked: list, empty state, delete, failed delete.
- [ ] `pnpm check` passes.
- [ ] By hand: talk to a mentor, close the dialogue, see the line; delete it,
      reload, it stays gone.

## Files likely touched

- `web/src/lib/api.ts`
- `web/src/features/world/use-ledger.ts` (new)
- `web/src/features/world/menus.tsx`, `features/world/world-page.tsx`
- `web/src/features/world/menus.test.tsx`
