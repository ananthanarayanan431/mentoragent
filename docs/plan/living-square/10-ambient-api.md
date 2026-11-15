# Task 10: Ambient chat API

Phase 3 (spec step 3). Size: M. Depends on: 04, 05.

## Goal

`POST /api/v1/ambient` writes a short chat between two mentors about your goal
(2 to 4 lines, one model call), stores it, and refuses when the pair is not
eligible or the last chat was less than 3 minutes ago. The browser decides when
to ask (task 12); the server only answers. No background job.

## Backend context

- **Route** in `routes/v1/square.py`: `POST /ambient` with
  `AmbientIn {mentor_ids: list[MentorId]}` (exactly 2, distinct; a
  `field_validator`), 201 → `AmbientChatOut {id, mentor_ids, lines: [{mentor_id,
text}], created_at}`. Depends on `require_api_key_in_production` (it costs
  money).
- **Eligibility** (pure, `services/ambient.py`): both mentors exist (else 404,
  `MentorNotFoundError`), neither has `memory == "building"`, and each has at
  least one ledger line (else 409, new `AmbientNotEligibleError(ConflictError)`
  with a message naming why).
- **Rate limit.** New `AgentSettings.AMBIENT_MIN_INTERVAL_SECONDS: int = Field(default=180, ge=30)`.
  If the newest stored ambient chat is younger, 429 with a new
  `AmbientTooSoonError(MentorAgentError)` (`status_code = 429`). Checking the
  newest document is enough for one user; no counters.
- **Generation.** `LlmAmbientWriter(model_factory)` like `LlmPersonaWriter`
  (`services/persona.py`): `with_structured_output(AmbientScript)` where
  `AmbientScript {lines: list[AmbientLine]}` with 2 to 4 items,
  `AmbientLine {speaker: Literal["a", "b"], text: str (max 160 chars)}`. The
  prompt gives both personas (name, perspective, style), the goal, and each
  mentor's own ledger lines, and asks for a short exchange about the user's goal
  in which they build on or disagree with each other, each line at most 20
  words, starting with mentor a. Map `a`/`b` back to ids. On a model failure
  raise `ConversationError` (502); nothing is stored.
- **Storage.** `AMBIENT_COLLECTION: str = "ambient_chats"` in `config/mongo.py`;
  `models/ambient.py` `AmbientChat`. Task 13 reads a chat by id to seed a group
  conversation, so add `get(chat_id)` now.
- **No ledger lines** from ambient chats (spec assumption 7).
- **Wiring** in `server.py` lifespan and `core/dependencies.py`; fakes in
  `tests/fakes.py` with a scripted writer.
- Finish with `make openapi`.

## Frontend context

Task 12 calls it: `POST /api/v1/ambient {mentor_ids: [a, b]}` →
`{id, mentor_ids, lines: [{mentor_id, text}], created_at}`; 404 unknown mentor,
409 not eligible (treat as "pick another pair later"), 429 too soon (treat as
"wait"). The `id` is kept to join the conversation (task 15).

## Acceptance criteria

- [ ] Two eligible mentors get 201 with 2 to 4 alternating lines starting with
      the first id, and the chat is stored.
- [ ] Same mentor twice or three ids is 422; a mentor with no ledger line or a
      building memory is 409; a second request within 180 seconds is 429.
- [ ] A model failure is 502 and stores nothing.

## Verification

- [ ] Unit tests: eligibility rules, rate limit with a fixed clock, mapping
      `a`/`b` to ids, 2-to-4 line validation.
- [ ] Contract tests for 201, 404, 409, 422, 429, 502.
- [ ] `scripts/ci/python-checks.sh agents/mentor_agent all` passes.
- [ ] By hand: `curl -X POST localhost:8000/api/v1/ambient -H 'content-type: application/json' -d '{"mentor_ids":["warren_buffett","charlie_munger"]}'`
      after talking to both; the lines are about your goal.

## Files likely touched

- `agents/mentor_agent/mentor_agent/services/ambient.py` (new), `models/ambient.py` (new)
- `agents/mentor_agent/mentor_agent/routes/v1/square.py`, `schemas/v1/square.py`
- `agents/mentor_agent/mentor_agent/core/errors.py`, `config/agent.py`, `config/mongo.py`, `server.py`, `core/dependencies.py`
- `agents/mentor_agent/tests/fakes.py`, `tests/unit/test_ambient.py` (new), `tests/contract/test_square_api.py`
- `libs/mentor-agent-contracts/openapi.json`, `libs/mentor-agent-contracts/src/schema.d.ts`
