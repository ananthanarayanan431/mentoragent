# Task 04: Ledger API: list and delete

Phase 1 (spec step 1). Size: S. Depends on: 03.

## Goal

Let the web app read the advice ledger (for the quest log and speech bubbles)
and delete a line the summary got wrong.

## Backend context

- **Reading.** Add `recent(limit: int) -> list[LedgerLine]` (newest first) and
  `delete(line_id: str) -> bool` to the ledger store from task 03. Reading
  needs `AsyncMongoRepository.fetch_documents(query, limit=, sort=)`, which
  already exists; deleting uses `delete_one`.
- **Routes** in `routes/v1/square.py` (created in 01):
  - `GET /ledger?limit=50` → `list[LedgerLineOut]`, newest first; `limit` 1 to
    200 (`Query(ge=1, le=200)`).
  - `DELETE /ledger/{line_id}` → 204; 404 via a new `LedgerLineNotFoundError(NotFoundError)`
    in `core/errors.py` (put the message in a variable before `raise`). Depends
    on `require_api_key_in_production`.
- **Schema.** `LedgerLineOut {id, mentor_id, mentor_name, topic, advice,
created_at}` in `schemas/v1/square.py`; do not expose `conversation_id`.
- **Fakes.** Give the in-memory ledger in `tests/fakes.py` the same two methods.
- Finish with `make openapi`.

## Frontend context

No UI here. Tasks 06 (quest log) and 09 (speech bubbles) call:
`GET /api/v1/ledger` → `[{id, mentor_id, mentor_name, topic, advice,
created_at}]` and `DELETE /api/v1/ledger/{id}` → 204.

## Acceptance criteria

- [ ] `GET /ledger` returns lines newest first, at most `limit`.
- [ ] `DELETE /ledger/{id}` removes the line (204); an unknown id is 404.
- [ ] A deleted line no longer reaches any mentor (task 05 reads the same store).

## Verification

- [ ] Contract tests: list order and limit, delete, 404, 422 for a bad limit.
- [ ] `scripts/ci/python-checks.sh agents/mentor_agent all` passes.
- [ ] `make -C agents/mentor_agent openapi`; contract diff shows the two routes.

## Files likely touched

- `agents/mentor_agent/mentor_agent/services/ledger.py`
- `agents/mentor_agent/mentor_agent/routes/v1/square.py`, `schemas/v1/square.py`
- `agents/mentor_agent/mentor_agent/core/errors.py`
- `agents/mentor_agent/tests/fakes.py`, `tests/contract/test_square_api.py`
- `libs/mentor-agent-contracts/openapi.json`, `libs/mentor-agent-contracts/src/schema.d.ts`
