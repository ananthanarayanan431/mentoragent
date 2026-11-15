# Task 11: Mentors visit each other

Phase 3 (spec step 3). Size: M. Depends on: nothing (game only).

## Goal

Teach the game to send one mentor walking to another, stop them side by side
facing each other, show lines as bubbles over whoever is speaking, and send them
back to wandering. React decides who and when (task 12); this task is the
movement and display only.

## Backend context

None. No requests are made from the game.

## Frontend context

- **Today.** `features/world/game/wander.ts` (pure, tested): each mentor ambles
  around its own `home` spot (`startWander`, `pickTarget`, `stepWander`), so two
  mentors never meet. `world-scene.ts` `updateMentor` steps the wander state
  unless `mentor.talking` is true; `facingTowards(from, to)` turns a sprite.
- **Pure additions** in `game/wander.ts` (or a new `game/visits.ts` with tests):
  - `meetingSpot(host: Point, visitor: Point, isFree): Point`: a walkable spot
    one tile beside the host, on the visitor's side when free, using the
    collision data the scene already has for wandering.
  - `stepVisit(state, position, delta)`: walk towards the spot (same speed and
    stuck-timeout as `stepWander`), report `arrived`.
- **Bridge** (`features/world/world-bridge.ts`):
  - Commands: `visit: { visitorId, hostId }`, `say: { mentorId, text }`,
    `endVisit: { visitorId, hostId }`.
  - Events: `met: { visitorId, hostId }` (both are standing face to face),
    `visitFailed: { visitorId, hostId }` (blocked, or one of them started
    talking with the player on the way).
- **Scene** (`world-scene.ts`):
  - `MentorActor` gets a `visit` state: walking (visitor), waiting (host stops
    wandering at once and faces the visitor as they arrive), or in a meeting.
  - On `say`, show the text as a bubble over that mentor (reuse the bubble from
    task 09 if done; otherwise a text object styled the same way) until the next
    `say` or `endVisit`.
  - On `endVisit`, both return to wandering from where they stand
    (`startWander(home, rng)`).
  - If the player starts talking to either mentor (`startTalk`), cancel the
    visit and emit `visitFailed`; joining is handled in React (task 15) before
    `talk` is acted on, so this only covers walking up to one of them mid-walk.
  - Respect `paused`: no movement and no timers while paused (the scene already
    freezes on the `paused` command).

## Acceptance criteria

- [ ] After `visit`, the visitor walks to a free spot beside the host, both face
      each other, and `met` fires once.
- [ ] `say` shows the line over the right mentor; `endVisit` clears bubbles and
      both wander again.
- [ ] A blocked walk or a talk with the player emits `visitFailed` and leaves
      both mentors wandering.

## Verification

- [ ] Unit tests for `meetingSpot` and `stepVisit` (arrive, blocked, already
      adjacent), in the style of `game/wander.test.ts`.
- [ ] `world-bridge.test.ts` for the new commands and events.
- [ ] `pnpm check` passes.
- [ ] By hand: temporarily trigger `visit` from the browser console through the
      bridge (or a dev-only key) and watch two mentors meet.

## Files likely touched

- `web/src/features/world/game/wander.ts` or `game/visits.ts` (new), with tests
- `web/src/features/world/game/world-scene.ts`
- `web/src/features/world/world-bridge.ts`, `features/world/world-bridge.test.ts`
