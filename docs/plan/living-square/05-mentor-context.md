# Task 05: Mentors read the goal and the ledger

Phase 1 (spec step 1). Size: M. Depends on: 01, 03.

## Goal

Before every reply, give the mentor your goal and the newest advice from the
other mentors, with a rule that keeps their own voice. This is the moment the
square starts to share context.

## Backend context

- **The slot already exists and is unused.** `chat/state.py` `MentorState` has
  `mentor_context: str`; `chat/nodes.py` `conversation_node` passes it to the
  prompt; `chat/prompt.py` `MENTOR_CHARACTER_PROMPT` renders it as
  `Additional context: {{ mentor_context }}`. `ConversationService.respond` and
  `.stream` (`services/conversation.py`) already take a `mentor_context: str = ""`
  argument and put it in the graph input. Nothing passes it today.
- **Build the block in a pure function** in `services/ledger.py`:
  `ledger_context(goal: str | None, lines: Sequence[LedgerLine], mentor_id: str) -> str`.
  Keep only lines from other mentors, the newest `LEDGER_LINES_IN_CONTEXT` (new
  `AgentSettings` field, default 8), formatted as
  `"{mentor_name} advised, on {topic}: {advice}"`, preceded by
  `"The user's goal: {goal}"`. Empty string when there is neither.
- **Prompt.** Replace the `Additional context` line in
  `MENTOR_CHARACTER_PROMPT` with a section that only appears when there is
  context, e.g.:

  ```
  {% if mentor_context %}
  What you know about the user from the square (other mentors' advice included):
  {{ mentor_context }}
  Mention another mentor's advice only when it changes your answer: build on it or
  push back on it, in your own voice. Never just repeat it.
  {% endif %}
  ```

  Prompts are versioned in Opik by name (`register_prompts`), so keep the name.

- **Wiring.** In `routes/v1/chat.py`, for both the HTTP and WebSocket turn, read
  the goal (profile service, task 01) and recent lines (task 04 `recent`), call
  `ledger_context`, and pass it as `mentor_context`. Reading must not fail the
  turn: on a `PyMongoError` log and use `""`.
- **Fakes.** The in-memory profile and ledger from 01 and 03 return what the
  test sets; `ScriptedChatModel.received` in `tests/fakes.py` lets a test assert
  what the model saw.

## Frontend context

None. The web app is unchanged; the effect is in the replies.

## Acceptance criteria

- [ ] `ledger_context` keeps only other mentors' lines, at most 8, newest first,
      with the goal on top; empty when there is nothing.
- [ ] A WebSocket or HTTP turn sends the block to the model (asserted through
      `ScriptedChatModel.received`); a ledger read failure still answers.
- [ ] By hand (Checkpoint A): after Buffett gives advice, Munger's reply to a
      related question builds on or pushes back on it in Munger's voice.

## Verification

- [ ] Unit tests for `ledger_context` (filtering, limit, order, no goal, empty).
- [ ] Contract test: the system prompt the scripted model received contains the
      goal and another mentor's line, and not the same mentor's own line.
- [ ] `scripts/ci/python-checks.sh agents/mentor_agent all` passes.
- [ ] By hand with three mentors: their replies do not converge into agreeing.

## Files likely touched

- `agents/mentor_agent/mentor_agent/services/ledger.py`
- `agents/mentor_agent/mentor_agent/chat/prompt.py`
- `agents/mentor_agent/mentor_agent/routes/v1/chat.py`
- `agents/mentor_agent/mentor_agent/config/agent.py`
- `agents/mentor_agent/tests/unit/test_ledger_context.py` (new), `tests/contract/test_api.py`
