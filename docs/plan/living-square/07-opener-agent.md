# Task 07: Opener on the WebSocket

Phase 2 (spec step 2). Size: M. Depends on: 05.

## Goal

When the web app asks, a mentor who has heard something new from the other
mentors speaks first: one or two sentences in their own voice, streamed like a
reply and saved in the conversation. With nothing new, the server says so and
calls no model.

## Backend context

- **New client message.** `{"mentor_id": "...", "conversation_id": "..."?, "opener": true}`
  (no `message`). Add `OpenerRequest {mentor_id, conversation_id?, opener: Literal[True]}`
  to `schemas/v1/chat.py`. In `routes/v1/chat.py`, replace
  `ChatRequest.model_validate(...)` with a pure
  `parse_client_message(data) -> ChatRequest | OpenerRequest` (and later
  `GroupChatRequest`, task 13): `opener` key → `OpenerRequest`, else
  `ChatRequest`. Validation errors keep today's `error` event shape.
- **Server events.** Either the usual `start`, `chunk`*, `end` (exactly as a
  reply), or `{"type": "silent", "conversation_id": ...}` when there is nothing
  to say. Document both in the `chat_websocket` docstring.
- **When to speak.** Pure `should_open(mentor_id, lines, heard_until) -> bool` in
  `services/ledger.py`: true when some other mentor's line is newer than both
  this mentor's newest line and `heard_until` (or there is a line from another
  mentor and this mentor has neither). Mentors with `memory == "building"` never
  open (the chat lock, `ensure_ready_to_chat`, already refuses them; send
  `silent` instead of an error here).
- **Remember what was heard.** Add `heard_until: dict[str, datetime]` handling to
  the profile service (task 01's `Profile` model already has the field):
  `mark_heard(mentor_id, at)` sets `heard_until.<mentor_id>` with `$set`. Call it
  after a successful opener.
- **Generating the opener.** Add `ConversationService.open(mentor, conversation_id, mentor_context) -> AsyncIterator[str]`
  in `services/conversation.py`:
  - Stream from `self.graph`'s mentor chain directly, not through the graph, so
    no fake user message lands in the history: build the same inputs
    `conversation_node` builds (`chat/nodes.py`) with `messages=[HumanMessage(OPENER_INSTRUCTION)]`,
    where `OPENER_INSTRUCTION` is a new prompt in `chat/prompt.py`: "The user
    has just walked up to you. In one or two short sentences, react to what
    another mentor told them, in your own voice. Do not greet at length."
    The chains are reachable through the `Nodes` instance the graph was built
    from; expose what is needed via `core/bootstrap.py` rather than reaching
    into private attributes.
  - After the last token, append only the reply to the thread:
    `await self.graph.aupdate_state(config, {"messages": [AIMessage(content=reply)], ...mentor fields})`
    so the next real turn sees it as the mentor's last message. Check with a
    test that a following `respond` call sees the opener in its history.
  - Errors raise `ConversationError`, like `stream`.
- **No ledger line** for an opener (it is not advice given in answer to you).

## Frontend context

Task 08 sends the opener request when a dialogue opens and handles `silent`.
The web types for server events are hand-written in `web/src/lib/types.ts`
(`ServerEvent`), not generated, so the WebSocket protocol in this task's
docstring is the contract task 08 follows.

## Acceptance criteria

- [ ] With a newer line from another mentor, an opener request streams
      `start`, `chunk`s, `end`, and `heard_until` is set for that mentor.
- [ ] Asking again with nothing newer answers `silent` and calls no model.
- [ ] The opener is in the conversation history: the next real reply's model
      input contains it as the mentor's message; no user message was added.

## Verification

- [ ] Unit tests: `parse_client_message` (each kind, invalid), `should_open`
      (no lines, own line newer, other newer, `heard_until` newer).
- [ ] Contract tests over the WebSocket with the fake conversation service and
      in-memory ledger/profile: opener stream, `silent`, building mentor.
- [ ] `scripts/ci/python-checks.sh agents/mentor_agent all` passes.

## Files likely touched

- `agents/mentor_agent/mentor_agent/routes/v1/chat.py`, `schemas/v1/chat.py`
- `agents/mentor_agent/mentor_agent/services/conversation.py`, `services/ledger.py`, `services/profile.py`
- `agents/mentor_agent/mentor_agent/chat/prompt.py`, `core/bootstrap.py`
- `agents/mentor_agent/tests/unit/test_opener.py` (new), `tests/contract/test_api.py`
