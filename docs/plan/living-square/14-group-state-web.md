# Task 14: Group conversation state

Phase 4 (spec step 4). Size: M. Depends on: 13.

## Goal

The web app can hold a conversation with two mentors: messages know who spoke,
the streaming protocol handles two speakers per turn, and the conversation is
kept per pair like one-on-one chats are kept per mentor.

## Backend context

Task 13's WebSocket protocol: send
`{mentor_ids: [first, second], message, conversation_id?, ambient_id?}`;
receive, per mentor, `start {conversation_id, mentor_id}`,
`chunk {content, mentor_id}`, `end {conversation_id, response, mentor_id}`, then
`turn_end {conversation_id}`; `error {detail}` ends a turn.

## Frontend context

- **Types** (`web/src/lib/types.ts`): `Message` gets an optional
  `mentorId?: string` (who spoke; absent in one-on-one chats). `ServerEvent`
  `start`, `chunk`, `end` get an optional `mentor_id`; add
  `{ type: 'turn_end'; conversation_id: string }`. Extend `parseServerEvent`
  (`features/chat/chat-state.ts`).
- **Reducer** (`features/chat/chat-state.ts`, keep one reducer, tested in
  `chat-state.test.ts`):
  - New action `{ type: 'sendGroup'; id; content }`: push the user message and
    set `isStreaming`, but no placeholder (the speakers are not known yet).
  - `start` with `mentor_id`: push an empty streaming message for that speaker.
  - `chunk`/`end` with `mentor_id`: update that speaker's streaming message.
    `end` with `mentor_id` does not end the turn.
  - `turn_end`: `isStreaming = false`.
  - Without `mentor_id` every event behaves exactly as today, so one-on-one
    chats are untouched (existing tests must still pass unchanged).
- **Storage** (`features/chat/storage.ts`): keys are per mentor today
  (`key(mentorId)`); add a group key from the two ids sorted and joined
  (`group:a+b`), so the same pair continues the same conversation whoever was
  walked up to. Wrap every `localStorage` access, as the module already does.
- **Hook** `features/chat/use-group-conversation.ts` modelled on
  `use-mentor-conversation.ts`: `useGroupConversation(mentorIds, ambientId?)`
  returning `{ state, status, send, startNewChat }`. `send` dispatches
  `sendGroup` and sends the group message (with `ambient_id` only on the first
  turn). No HTTP fallback. `startNewChat` clears storage and deletes both
  threads (`deleteConversation(mentorId, conversationId)` for each mentor).
- **No UI here**; task 15 renders it.

## Acceptance criteria

- [ ] A group turn produces, in order: your message, the first mentor's reply,
      the second mentor's reply, each with the right `mentorId`; streaming ends
      only at `turn_end`.
- [ ] One-on-one chats behave exactly as before.
- [ ] A pair's conversation survives a reload and is the same whichever mentor
      was walked up to.

## Verification

- [ ] `chat-state.test.ts`: full group turn, error mid-turn, one-on-one
      regression.
- [ ] `storage.test.ts`: group key independent of order.
- [ ] Hook test with the socket mocked as in `use-mentor-conversation.test.ts`.
- [ ] `pnpm check` passes.

## Files likely touched

- `web/src/lib/types.ts`
- `web/src/features/chat/chat-state.ts`, `features/chat/chat-state.test.ts`
- `web/src/features/chat/storage.ts`, `features/chat/storage.test.ts`
- `web/src/features/chat/use-group-conversation.ts` (new), with a test
