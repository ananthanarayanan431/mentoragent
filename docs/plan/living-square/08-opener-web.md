# Task 08: Mentors speak first in the dialogue

Phase 2 (spec step 2). Size: M. Depends on: 07.

## Goal

When you open a dialogue in the square, ask the mentor for an opener; if they
have one, it types out as their line before you say anything. If not, the usual
greeting shows.

## Backend context

Task 07's WebSocket protocol on `/api/v1/ws/chat`:

- Client sends `{mentor_id, conversation_id?, opener: true}`.
- Server answers `start` → `chunk`* → `end` (same shapes as a reply), or
  `{type: "silent", conversation_id}`.
- A mentor whose memory is building always gets `silent`.

## Frontend context

- **Types.** Add `{ type: 'silent'; conversation_id: string | null }` to
  `ServerEvent` in `web/src/lib/types.ts` and accept it in `parseServerEvent`
  (`features/chat/chat-state.ts`).
- **Reducer** (`features/chat/chat-state.ts`, pure, tested in
  `chat-state.test.ts`):
  - New action `{ type: 'open'; id: string }`: if not streaming, push only an
    empty streaming mentor message (no user message) and set `isStreaming`.
  - `silent`: drop that empty placeholder and stop streaming. The existing
    `updateStreaming` / `fail` helpers show how placeholders are handled.
- **Hook** (`features/chat/use-mentor-conversation.ts`): add
  `requestOpener(): boolean`, which dispatches `open` and sends
  `{ mentor_id, opener: true, conversation_id? }` through `socketSend`. No HTTP
  fallback: if the socket is not open, skip the opener (return false) and the
  greeting shows.
- **Dialogue box** (`features/world/dialogue-box.tsx`): request the opener once
  on mount, when not locked (`mentor.memory !== 'building'`) and not already
  streaming. `currentExchange` (`features/world/dialogue.ts`) already handles a
  reply with no question, and the typewriter already types any new reply, so
  the opener needs no new display code. Use a ref so React strict mode's double
  mount does not send two requests.
- **Chat page.** Do not request openers on the full `/chat/:id` page; the
  opener is part of walking up to someone in the square.
- **Sending while the opener streams.** The send button is already disabled
  while `isStreaming`; keep it so.

## Acceptance criteria

- [ ] Opening a dialogue sends one opener request; a streamed opener types out
      as the mentor's line, with no "You:" line above it.
- [ ] A `silent` answer leaves the greeting and no empty message.
- [ ] A locked mentor (memory building) sends no opener request.

## Verification

- [ ] `chat-state.test.ts`: `open` then chunks and `end`; `open` then `silent`;
      `open` while streaming is ignored.
- [ ] `dialogue-box.test.tsx`: the mocked socket receives `{opener: true}` once
      on mount; a scripted opener shows; `silent` shows the greeting; locked
      sends nothing.
- [ ] `pnpm check` passes.
- [ ] By hand: talk to Buffett, close, walk to Munger; Munger speaks first.

## Files likely touched

- `web/src/lib/types.ts`
- `web/src/features/chat/chat-state.ts`, `features/chat/chat-state.test.ts`
- `web/src/features/chat/use-mentor-conversation.ts`
- `web/src/features/world/dialogue-box.tsx`, `features/world/dialogue-box.test.tsx`
