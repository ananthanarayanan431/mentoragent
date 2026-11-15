# Task 09: Speech bubbles

Phase 2 (spec step 2). Size: M. Depends on: 06 (the ledger in `world-page.tsx`).

## Goal

When you walk near a mentor you have talked to, a small bubble over them shows
the newest thing they told you ("Told you about moats"). No model calls.

## Backend context

None new. The data is the ledger already loaded for the quest log (task 06):
`[{id, mentor_id, mentor_name, topic, advice, created_at}]`, newest first.

## Frontend context

- **Pure rule** in `features/world/bubbles.ts` with tests:
  `bubbleTexts(ledger) -> Record<mentorId, string>`: the newest line per mentor,
  as `Told you about ${topic}` with the topic as written, trimmed to 32
  characters with an ellipsis.
- **Bridge** (`features/world/world-bridge.ts`): new command
  `bubbles: { texts: Record<string, string> }`. React sends it whenever the
  ledger changes (an effect in `world-page.tsx`).
- **Scene** (`features/world/game/world-scene.ts`, Phaser only here):
  - Each `MentorActor` gets a `bubble` text object, created like `label` (see
    where `label` is added around `createMentor`), hidden by default.
  - In `updateMentor`, place the bubble above the label (label sits at
    `sprite.y - CHARACTER_H / 2 + 2`); show it only when the mentor has a text,
    the player is within a few tiles (reuse the distance helpers in
    `game/wander.ts`, e.g. `nearestWithin`), and the mentor is not talking.
  - Style: small mono text on a white rounded box with a dark outline, matching
    the pixel style; all art is drawn in code at `ART_SCALE` (`web/CLAUDE.md`).
    A Phaser `Text` with `backgroundColor` and padding is enough.
  - Bubbles are independent of the name-label toggle in the pause menu; they
    follow the player's distance only.
- **Accessibility.** The canvas is not readable by screen readers; the same
  information is in the quest log (task 06), so nothing extra is needed.

## Acceptance criteria

- [ ] Walking near a mentor who has a ledger line shows their bubble; walking
      away hides it; mentors with no lines never show one.
- [ ] Deleting a line in the quest log updates or removes that mentor's bubble.
- [ ] No network request or model call is made to show bubbles.

## Verification

- [ ] `bubbles.test.ts`: newest per mentor, trimming, empty ledger.
- [ ] `world-bridge.test.ts`: the `bubbles` command reaches a listener.
- [ ] `pnpm check` passes.
- [ ] By hand: talk to two mentors, walk around, bubbles appear and disappear.

## Files likely touched

- `web/src/features/world/bubbles.ts` (new), `features/world/bubbles.test.ts` (new)
- `web/src/features/world/world-bridge.ts`, `features/world/world-bridge.test.ts`
- `web/src/features/world/game/world-scene.ts`
- `web/src/features/world/world-page.tsx`
