# Task 15: Join a conversation

Phase 4 (spec step 4). Size: M. Depends on: 12, 14.

## Goal

Walk up to two mentors who are chatting (or who stopped less than 10 seconds
ago), press Space, and you are in: a group dialogue that starts from their
lines, where each of your messages gets a reply from both, one speaker at a
time.

## Backend context

Nothing new. Group turns are task 13's WebSocket protocol, used through task
14's `useGroupConversation(mentorIds, ambientId)`. The `ambient_id` from task 12
is sent on the first turn so both mentors remember what they were saying.

## Frontend context

- **Deciding to join** (pure, `features/world/ambient.ts` from task 12, with
  tests): `joinableMeeting(meeting, mentorId, now)` returns the meeting when
  `mentorId` is one of its two mentors and the meeting is active or ended less
  than 10 seconds ago; else `null`.
- **World page** (`world-page.tsx`): on the game's `talk {mentorId}` event,
  check `joinableMeeting` first. If it matches, stop the visit (`endVisit`),
  and set `mode` to a new `{ kind: 'group'; mentorIds: [walkedUpTo, other];
ambientId }`, where the mentor you walked up to answers first (plan decision
  3). Otherwise talk one-on-one as today. Group mode disables game input and
  pauses ambient chats exactly like `talking`; closing sends `endTalk` for both
  mentors.
- **Group dialogue box** `features/world/group-dialogue-box.tsx`, built from the
  pieces of `dialogue-box.tsx` rather than copying it whole:
  - Opens on the ambient lines as the starting exchange (shown, not retyped).
  - One exchange at a time: your line, then the first reply typing out under
    that mentor's name plate; when it is done (▼), Space on an empty box or a
    click moves on to the second reply, which types out under the other name
    plate. Use `useTypewriter` (`features/world/use-typewriter.ts`) per reply,
    keyed by message id.
  - Header shows both avatars and names; Log shows the whole group conversation
    with each line under its speaker's name (`MessageBubble` takes a
    `mentorName`; pass the speaker's).
  - The input, Escape to close, the key hints and the screen-reader live region
    follow `dialogue-box.tsx`.
  - Locked if either mentor's memory is building (should not happen, since
    ambient chats need both ready, but keep the guard).
- **Friendship and quest log.** Count a group message for both mentors
  (`recordMessage` in `features/world/progress.ts`).

## Acceptance criteria

- [ ] Pressing Space next to a mentor in an active or just-ended meeting opens
      the group dialogue with their lines; next to anyone else it opens the
      usual dialogue.
- [ ] Sending a message shows the first mentor's reply, then (Space or click)
      the second's, each under its own name plate; the Log shows all of it.
- [ ] Closing returns both mentors to wandering and resumes ambient chats.

## Verification

- [ ] `ambient.test.ts`: `joinableMeeting` inside, at, and after the 10-second
      window; mentor not in the meeting.
- [ ] `group-dialogue-box.test.tsx` with the socket mocked: ambient lines shown,
      a scripted two-speaker turn, advancing with Space, Log, Escape.
- [ ] `world-page.test.tsx`: `talk` during a meeting opens the group dialogue.
- [ ] `pnpm check` passes.
- [ ] By hand (Checkpoint D): join an ambient chat, ask one question, get two
      replies, the second reacting to the first.

## Files likely touched

- `web/src/features/world/ambient.ts`, `features/world/ambient.test.ts`
- `web/src/features/world/group-dialogue-box.tsx` (new), with a test
- `web/src/features/world/world-page.tsx`, `features/world/world-page.test.tsx`
- `web/src/features/world/progress.ts`
