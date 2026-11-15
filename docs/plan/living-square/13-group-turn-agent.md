# Task 13: Group turn on the WebSocket

Phase 4 (spec step 4). Size: M. Depends on: 05, 07 (`parse_client_message`), 10
(ambient chats by id).

## Goal

One message to two mentors at once: the first answers, then the second answers
having read the first. Both stream over the existing socket, each event tagged
with its speaker, and each reply writes a ledger line.

## Backend context

- **Client message.** `GroupChatRequest {mentor_ids: [first, second], message,
conversation_id?, ambient_id?}` in `schemas/v1/chat.py` (exactly 2 distinct
  ids; message rules as `ChatRequest`). `parse_client_message` (task 07) returns
  it when `mentor_ids` is present.
- **Server events** for one turn: `start`, `chunk`*, `end` for the first mentor,
  then the same for the second, every event with `mentor_id`, then
  `{"type": "turn_end", "conversation_id"}`. An error ends the turn with
  `{"type": "error", "detail"}` (no `turn_end`). Existing one-on-one events stay
  as they are (no `mentor_id` required).
- **Threads.** Reuse the checkpointer: each mentor keeps its own thread
  `thread_id_for(mentor_id, conversation_id)` (`services/conversation.py`), with
  the same `conversation_id` for both. A new `conversation_id` is a
  `uuid4().hex`, as in `routes/v1/chat.py` `_new_conversation_id`.
- **What each mentor knows** (pure `group_context(...)` in a new
  `services/group.py`, appended to the ledger context from task 05):
  - "You are in a conversation with the user and {other name}."
  - On the first turn with an `ambient_id`: the ambient lines (task 10 `get`),
    "This is what you and {other} were just saying: ...".
  - For the second mentor: "{first} just answered: {first reply}".
  - For the first mentor on later turns: "{second} last said: {their previous
    reply}", read from the second mentor's thread
    (`graph.aget_state(config).values["messages"]`, last `AIMessage`). Add a
    small `ConversationService.last_reply(mentor_id, conversation_id) -> str | None`.
  - The rule: speak to the user, react to the other mentor only when you agree
    or disagree, keep your own voice, stay under 80 words.
- **Each mentor's reply** goes through `ConversationService.stream` (so
  retrieval over that mentor's own sources still works) with the combined
  `mentor_context`.
- **Readiness.** Both mentors must pass `ensure_ready_to_chat` (memory not
  building) before anything streams.
- **Ledger.** After each mentor's `end`, record a ledger line for that mentor
  (task 03, same tracked task), with the user's message and that reply.
- **HTTP.** No group variant of `POST /chat`; group conversations are
  WebSocket only.

## Frontend context

Tasks 14 and 15 implement the client. The protocol in the `chat_websocket`
docstring is the contract (WebSocket types are hand-written in
`web/src/lib/types.ts`): send
`{mentor_ids: [first, second], message, conversation_id?, ambient_id?}`; receive
`start {conversation_id, mentor_id}`, `chunk {content, mentor_id}`,
`end {conversation_id, response, mentor_id}` for each mentor, then
`turn_end {conversation_id}`.

## Acceptance criteria

- [ ] A group message streams the first mentor's reply then the second's, each
      tagged with `mentor_id`, followed by `turn_end`.
- [ ] The second mentor's model input contains the first mentor's reply from the
      same turn; on the first turn with `ambient_id`, both see the ambient lines.
- [ ] A building mentor in the pair gets an `error` and nothing streams; each
      completed reply records one ledger line.

## Verification

- [ ] Unit tests for `group_context` (first turn with and without ambient, second
      speaker, later turns).
- [ ] Contract test over the WebSocket with a `ScriptedChatModel` returning two
      replies: event order, tags, what the second model call received, ledger
      calls.
- [ ] `scripts/ci/python-checks.sh agents/mentor_agent all` passes.

## Files likely touched

- `agents/mentor_agent/mentor_agent/services/group.py` (new)
- `agents/mentor_agent/mentor_agent/services/conversation.py`
- `agents/mentor_agent/mentor_agent/routes/v1/chat.py`, `schemas/v1/chat.py`
- `agents/mentor_agent/tests/unit/test_group_context.py` (new), `tests/contract/test_api.py`
