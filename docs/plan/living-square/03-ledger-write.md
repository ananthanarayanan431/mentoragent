# Task 03: Write a ledger line after each exchange

Phase 1 (spec step 1). Size: M. Depends on: nothing (01 for the shared
`square` modules if already merged).

## Goal

After every completed one-on-one reply, save one line to the advice ledger: who
advised you, on what topic, what they said. This is the engine every later
step reads.

## Backend context

- **Where a turn ends.** `routes/v1/chat.py`:
  - WebSocket `chat_websocket`: after the loop over `conversations.stream(...)`
    it sends `{"type": "end", ...}` with the full reply (`"".join(parts)`). The
    user's message is `body.message`, the mentor is `mentor`
    (`MentorExtract`), the thread is `conversation_id`.
  - HTTP `chat`: `conversations.respond(...)` returns `ChatReply.content`.
- **Never delay the reply.** WebSocket: after sending `end`, start
  `asyncio.create_task(ledger.record(...))` and keep the task in a module-level
  `set` with `task.add_done_callback(set.discard)` so it is not garbage
  collected. HTTP: add a `BackgroundTasks` parameter and
  `background.add_task(ledger.record, ...)` (as `routes/v1/mentors.py` does).
- **The writer.** `services/ledger.py` with a `LedgerWriter` protocol and
  `LlmLedgerWriter(model_factory, repository)`, modelled on
  `services/persona.py` `LlmPersonaWriter`: `model_factory().with_structured_output(LedgerNote)`
  where `LedgerNote {topic: str | None (max 40 chars, at most 4 words), advice: str | None (max 200 chars)}`.
  Both `None` means "no real advice" (greetings, small talk): write nothing.
  `record()` never raises: `except Exception` with `logger.exception` and
  `# noqa: BLE001 - a background job: the chat must not notice`.
- **Model.** `build_summary_model` from `chat/llm.py` (the cheap model), passed
  as the factory so the API starts without a key.
- **Prompt.** Short system prompt: "Summarise the advice {mentor} just gave the
  user as a topic (at most 4 words) and the advice (one sentence, at most 25
  words, in the third person). If there is no concrete advice, return nulls."
  Send only the user message and the reply, never the whole history.
- **Stored line.** `models/ledger.py` `LedgerLine {id (uuid hex), mentor_id,
mentor_name, conversation_id, topic, advice, created_at}` in a new
  `LEDGER_COLLECTION: str = "advice_ledger"` (`config/mongo.py`); create an
  index on `created_at` at start-up (`server.py` lifespan, like the `id` index
  in `services/mentors.py` usage).
- **Wiring.** Build the writer in `server.py` lifespan, store it on
  `app.state.ledger`, add `get_ledger` / `LedgerDep` to `core/dependencies.py`.
- **Logs.** Never log the advice text or the messages (agent rules: no prompts
  or retrieved documents in logs); log ids only.
- **Fakes.** `RecordingLedgerWriter` in `tests/fakes.py` that records calls; the
  contract test lifespan installs it.

## Frontend context

None. Nothing changes for the web app; the ledger becomes visible in tasks 04
and 06.

## Acceptance criteria

- [ ] A completed WebSocket or HTTP reply leads to exactly one `record` call with
      the mentor, conversation id, user message and full reply; an `error` turn
      leads to none.
- [ ] A note with real advice is stored as a `LedgerLine`; a note with nulls
      stores nothing; a model failure stores nothing and the reply is unaffected.
- [ ] The reply's `end` event is sent before the ledger call starts.

## Verification

- [ ] Unit tests for `LlmLedgerWriter` with a `ScriptedChatModel`-style fake or
      a stub model returning a `LedgerNote` (advice, nulls, exception).
- [ ] Contract tests: WebSocket and HTTP turns call the recording writer once;
      a failing turn does not.
- [ ] `scripts/ci/python-checks.sh agents/mentor_agent all` passes.
- [ ] By hand: chat with a mentor, then
      `docker exec mentoragent-mongo mongosh ... --eval 'db.getSiblingDB("mentoragents").advice_ledger.find()'`
      shows one short line per real piece of advice.

## Files likely touched

- `agents/mentor_agent/mentor_agent/models/ledger.py` (new)
- `agents/mentor_agent/mentor_agent/services/ledger.py` (new)
- `agents/mentor_agent/mentor_agent/routes/v1/chat.py`
- `agents/mentor_agent/mentor_agent/server.py`, `core/dependencies.py`, `config/mongo.py`
- `agents/mentor_agent/tests/fakes.py`, `tests/unit/test_ledger_writer.py`, `tests/contract/test_api.py`
