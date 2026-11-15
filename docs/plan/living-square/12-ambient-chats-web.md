# Task 12: Ambient chats in the square

Phase 3 (spec step 3). Size: M. Depends on: 10, 11.

## Goal

While you play, every few minutes pick two mentors you have talked to, send one
to the other, get their chat from the server and play it as bubbles. Only while
the square is open, playing and unpaused. Close the tab and nothing happens.

## Backend context

Task 10: `POST /api/v1/ambient {mentor_ids: [visitor, host]}` → 201
`{id, mentor_ids, lines: [{mentor_id, text}], created_at}`; 409 not eligible,
429 too soon (the server's floor is 180 seconds), 404 unknown mentor. Any error
means "skip this one and try again at the next tick".

## Frontend context

- **API client.** `startAmbientChat(mentorIds)` in `web/src/lib/api.ts`.
- **Pure rules** in `features/world/ambient.ts` with tests:
  - `eligiblePairs(mentors, ledger)`: mentors with at least one ledger line and
    memory not building, as unordered pairs.
  - `pickPair(pairs, rng, lastPair)`: random, avoiding the last pair when
    another exists.
  - `nextDelayMs(rng)`: 180 to 300 seconds.
  - `lineDurationMs(text)`: about 1.5 s plus 60 ms per character, capped at 6 s.
- **Orchestration** in a hook `features/world/use-ambient-chats.ts`, used by
  `World` in `world-page.tsx`:
  - Runs only while `mode.kind === 'playing'` (not title, paused or talking)
    and the document is visible (`document.visibilityState`). Leaving that state
    cancels the timer; returning schedules a fresh delay.
  - On a tick: pick a pair, send `visit`; on `met` call the API, then for each
    line send `say` and wait `lineDurationMs`, then `endVisit`. On `visitFailed`
    or any API error, send `endVisit` and schedule the next tick.
  - Keep `{ id, mentorIds, endedAt }` of the current or last meeting in state;
    task 15 uses it to join.
  - Uses the ledger already loaded in `world-page.tsx` (task 06).
- **Testing time.** Inject the clock and rng into the hook (or keep the hook
  thin and test the pure module) so tests do not wait minutes; Vitest fake
  timers work with the injected timers.

## Acceptance criteria

- [ ] With two eligible mentors and the square playing, a meeting starts after
      the delay, the lines play over the right mentors in order, and both go
      back to wandering.
- [ ] Nothing is scheduled or requested on the title screen, while paused,
      during a dialogue, or when the tab is hidden.
- [ ] A 409 or 429 skips quietly and the next attempt comes after a new delay.

## Verification

- [ ] `ambient.test.ts` for the pure rules.
- [ ] Hook test with fake timers, a fake bridge and a mocked API: schedule,
      play, pause cancels, error skips.
- [ ] `pnpm check` passes.
- [ ] By hand (Checkpoint C): play 15 minutes with two eligible mentors; at
      least one chat about your goal, none closer than 3 minutes, none while
      paused.

## Files likely touched

- `web/src/lib/api.ts`
- `web/src/features/world/ambient.ts` (new), `features/world/ambient.test.ts` (new)
- `web/src/features/world/use-ambient-chats.ts` (new), with a test
- `web/src/features/world/world-page.tsx`
