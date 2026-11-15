# Task 01: Goal API

Phase 1 (spec step 1). Size: M. Depends on: nothing.

## Goal

Store your one goal on the server and expose it as `GET /api/v1/goal` and
`PUT /api/v1/goal`, so every later task (mentor context, openers, ambient
chats) can read it.

## Backend context

- **Pattern to copy.** `services/mentors.py` (`MentorService` over an
  `AsyncMongoRepository`) and its route module `routes/v1/mentors.py`. Services
  are built once in `server.py` `lifespan` and stored on `app.state`; routes get
  them through a dependency in `core/dependencies.py`
  (`get_mentor_service` / `MentorServiceDep` is the model).
- **Repository.** `db/client.py` `AsyncMongoRepository[T]` has `fetch_one`,
  `update_one` (a `find_one_and_update` with `$set`, no upsert). The goal is a
  single document, so add an `upsert: bool = False` keyword to `update_one`
  (pass `upsert=True` to `find_one_and_update`) rather than a new method.
- **Settings.** Add `PROFILE_COLLECTION: str = "profile"` to `config/mongo.py`
  (`MongoSettings`) and `GOAL_MAX_CHARS: int = Field(default=280, gt=0)` to
  `config/agent.py` (`AgentSettings`), each with a line in the class docstring.
- **Document.** `{_id: "me", goal: str, updated_at: datetime}`. Later tasks add
  `heard_until: {mentor_id: datetime}` (task 07) to the same document, so model
  it as a `Profile` Pydantic model in `models/profile.py` with
  `goal: str | None = None`, `heard_until: dict[str, datetime] = {}`.
- **Routes.** New `routes/v1/square.py` with `router = APIRouter(tags=["square"])`,
  mounted in `routes/v1/__init__.py` next to `mentors.router`. `PUT` depends on
  `require_api_key_in_production` (it changes data). Bodies in a new
  `schemas/v1/square.py`: `GoalIn {goal: str}` stripped, 1 to `GOAL_MAX_CHARS`
  characters (see `ChatRequest.limit_length` in `schemas/v1/chat.py` for the
  validator style); `GoalOut {goal: str | None}`.
- **Fakes.** Add `InMemoryProfileService` to `tests/fakes.py` (as
  `InMemoryMentorService`), and install it in the contract tests' lifespan
  (`tests/contract/test_api.py` `_client`).

## Frontend context

No UI in this task. Task 02 consumes `GET`/`PUT /goal` through the generated
contract (`libs/mentor-agent-contracts`), so finish with `make openapi` and
commit both contract files.

## Acceptance criteria

- [ ] `GET /api/v1/goal` returns `{"goal": null}` before any goal is set.
- [ ] `PUT /api/v1/goal` with `{"goal": "  Retire by 45  "}` stores and returns
      `{"goal": "Retire by 45"}`; blank or over 280 characters is a 422.
- [ ] The goal survives an agent restart (it lives in MongoDB).

## Verification

- [ ] Contract tests for both routes, including 422s, in
      `tests/contract/test_square_api.py`.
- [ ] Unit test for `ProfileService` against a `MagicMock` repository (see
      `tests/unit/test_mentor_service.py`).
- [ ] `scripts/ci/python-checks.sh agents/mentor_agent all` passes.
- [ ] `make -C agents/mentor_agent openapi`; the contract diff contains only the
      new routes.
- [ ] By hand: `curl -X PUT localhost:8000/api/v1/goal -H 'content-type: application/json' -d '{"goal":"Retire by 45"}'`,
      restart `./run.sh`, `curl localhost:8000/api/v1/goal`.

## Files likely touched

- `agents/mentor_agent/mentor_agent/models/profile.py` (new)
- `agents/mentor_agent/mentor_agent/services/profile.py` (new)
- `agents/mentor_agent/mentor_agent/routes/v1/square.py` (new), `routes/v1/__init__.py`
- `agents/mentor_agent/mentor_agent/schemas/v1/square.py` (new)
- `agents/mentor_agent/mentor_agent/server.py`, `core/dependencies.py`, `db/client.py`, `config/mongo.py`, `config/agent.py`
- `agents/mentor_agent/tests/fakes.py`, `tests/contract/test_square_api.py`, `tests/unit/test_profile_service.py`
- `libs/mentor-agent-contracts/openapi.json`, `libs/mentor-agent-contracts/src/schema.d.ts`
