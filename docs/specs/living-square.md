# Spec: The Living Square

Status: planned ([task breakdown](../plan/living-square/00-plan.md)). Idea: [docs/ideas/living-square.md](../ideas/living-square.md).

## Assumptions

Correct any of these before the plan is written.

1. **One user.** One goal and one advice ledger for the whole deployment; no
   accounts. (Confirmed.)
2. **The goal is one line of free text**, at most 280 characters, editable at
   any time.
3. **Mentors see recent advice, not searched advice.** Each reply gets the goal
   plus the 8 newest ledger lines from _other_ mentors. Picking lines by
   relevance to the question comes later, if recency proves too blunt.
4. **Every ledger line is visible to every mentor.** No private lines in this
   version.
5. **The cheap model does the extra work.** Ledger lines, openers and ambient
   chats use `LLM_MODEL_CONTEXT_SUMMARY` (Haiku). No new dependencies.
6. **Nothing runs while the square is closed.** Openers and ambient chats are
   requested by the browser; the server only answers. No background jobs, no
   cron.
7. **Ambient chats are stored**, so joining one continues it. They do not write
   ledger lines; advice given to _you_ inside a group conversation does.
8. **A mentor whose memory is building takes no part** in openers, ambient chats
   or group conversations, as with one-on-one chat today.

## Objective

Make the square one shared world. You come with one goal; every mentor knows
it and knows what the others have told you, and the square shows it: mentors
open with what they have heard, bubbles hint at what they think, pairs of
mentors now and then talk about your goal, and you can join them.

Success is the square feeling alive: the first time a mentor says "I hear
Charlie told you to concentrate your bets", without you repeating anything.

### Step 1: advice ledger and goal

- As the user, I set my goal once (from the quest log) and every mentor knows
  it.
- After each exchange, one ledger line is saved: mentor, topic (at most 4
  words), advice (at most 25 words).
- Before every reply, the mentor's system prompt gets the goal and the 8 newest
  ledger lines from other mentors, with the rule: mention another mentor only to
  build on or push back on them, in your own voice, and only when it changes
  your answer.
- Writing the ledger line never delays the reply; if it fails, it is logged and
  the chat carries on.

### Step 2: mentors speak first, and speech bubbles

- When I open a dialogue with a mentor and there are ledger lines from other
  mentors newer than my last exchange with this mentor, the mentor speaks first:
  one or two sentences reacting to that advice, streamed and typed out like any
  reply, and saved in the conversation.
- Otherwise the usual greeting shows and no model is called.
- Over each mentor I have talked to, a bubble shows their newest ledger topic
  ("Told you about moats") when I walk near. Bubbles call no model.

### Step 3: ambient mentor chats

- While I play, now and then the game sends one mentor walking to another, they
  stop, face each other, and talk: 2 to 4 short lines shown as bubbles, then
  they go back to wandering.
- If both have advised me (each has a ledger line) they talk about my goal;
  otherwise they have a short, simple chat between themselves and move on.
- Their lines play for 30 seconds at most in all.
- Only while the square is open and not paused, and at most one chat every 3
  minutes (enforced by the server too).

### Step 4: join their conversation

- While two mentors are mid-chat (or within 10 seconds after), walking up and
  pressing Space opens a group dialogue that starts from their ambient lines.
- Each message I send gets a reply from both mentors, one after the other; the
  second has read the first. Both replies stream, typed out one speaker at a
  time with a name plate each, Space to advance.
- Each reply writes a ledger line, like a one-on-one reply.

## API

All under `/api/v1`. Writes depend on `require_api_key_in_production`. Every
change is followed by `make -C agents/mentor_agent openapi`.

| Method & path         | Body / response                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /goal`           | `{goal: string \| null}`                                                                                                                      |
| `PUT /goal`           | `{goal: string}` (1 to 280 characters, trimmed) → `{goal}`                                                                                    |
| `GET /ledger`         | `?limit=50` → `[{id, mentor_id, mentor_name, topic, advice, created_at}]`, newest first                                                       |
| `DELETE /ledger/{id}` | 204; 404 if unknown                                                                                                                           |
| `POST /ambient`       | `{mentor_ids: [a, b]}` → 201 `{id, mentor_ids, lines: [{mentor_id, text}], about_user}`; 409 if a mentor is still reading up; 429 if too soon |

WebSocket `/ws/chat`, additions to the existing protocol (unchanged messages keep
working):

- **Opener:** client sends `{mentor_id, conversation_id, opener: true}` with no
  `message`. Server answers with the usual `start`, `chunk`, `end` events, or
  `{type: "silent", conversation_id}` when the mentor has nothing new to react
  to. An opener does not repeat: the profile keeps `heard_until[mentor_id]`.
- **Group turn:** client sends `{mentor_ids: [a, b], message, conversation_id?,
ambient_id?}`. Server sends `start`, `chunk`, `end` for mentor `a`, then for
  mentor `b`, each event carrying `mentor_id`, then `{type: "turn_end",
conversation_id}`. An `error` ends the turn.

## Data (MongoDB)

| Collection      | Document                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `profile`       | `{_id: "me", goal, updated_at, heard_until: {mentor_id: datetime}}`                               |
| `advice_ledger` | `{id, mentor_id, mentor_name, conversation_id, topic, advice, created_at}`; index on `created_at` |
| `ambient_chats` | `{id, mentor_ids, lines: [{mentor_id, text}], created_at}`                                        |

Group conversations reuse the checkpointer: each mentor keeps its own thread
`<mentor_id>:<conversation_id>`, and the other mentor's reply in the same turn is
passed in as context.

## Tech Stack

Unchanged: Python 3.12, FastAPI, LangGraph, langchain-anthropic, MongoDB Atlas
Local 8.0; React 19, Vite, Phaser, Tailwind, Vitest. No new dependencies.

## Commands

```bash
make -C infra up                                  # MongoDB
agents/mentor_agent/run.sh                        # API with reload on :8000
pnpm dev                                          # web app on :5173
scripts/ci/python-checks.sh agents/mentor_agent all   # Python gate
pnpm check                                        # web gate
make -C agents/mentor_agent openapi               # after any route or schema change
```

## Project Structure

New and changed code, following the existing layout:

```
agents/mentor_agent/mentor_agent/
  services/goal.py        goal read/write
  services/ledger.py      write a line after an exchange; read recent lines
  services/ambient.py     eligibility, rate limit, one call for both sides
  services/conversation.py  context from goal + ledger; opener; group turn
  routes/v1/square.py     /goal, /ledger, /ambient
  routes/v1/chat.py       opener and group turns on the WebSocket
  schemas/v1/square.py    request and response bodies
  prompts/                context block, opener and ambient prompts
web/src/
  features/world/         goal in the quest log, bubbles, ambient chats, joining
  features/world/game/    a mentor visiting another (pure, in wander.ts)
  features/chat/          opener and group turns in chat-state.ts
docs/specs/living-square.md   this spec
```

## Code Style

Follow the agent and web `CLAUDE.md` rules. New services look like the existing
ones: a protocol for what routes depend on, pure helpers that are easy to test,
loguru with arguments, specific exceptions at boundaries.

```python
def ledger_context(goal: str | None, lines: Sequence[LedgerLine], mentor_id: str) -> str:
    """The context block for one mentor: the goal and what the others advised.
    Pure, so it is easy to test."""
    others = [line for line in lines if line.mentor_id != mentor_id][:LEDGER_LINES_IN_CONTEXT]
    parts = [f"The user's goal: {goal}"] if goal else []
    parts += [f"{line.mentor_name} advised, on {line.topic}: {line.advice}" for line in others]
    return "\n".join(parts)
```

On the web side, rules live in pure modules with tests (as `dialogue.ts` and
`wander.ts` do); the Phaser scene only draws and moves.

## Testing Strategy

- **Python:** pytest; unit tests for pure helpers (context block, opener
  decision, eligibility and rate limit, ambient line parsing) and services with
  fakes from `tests/fakes.py`; contract tests for every new route and the new
  WebSocket messages. No network, no real database. Coverage stays at or above
  `fail_under`.
- **Web:** Vitest; pure modules (who can visit whom, when a pair is joinable,
  group turn reducer events) and components (goal editor, bubbles, group
  dialogue box with two speakers).
- **By hand, per step:** run the app and check the success criteria below.

## Boundaries

- **Always:** run both gates before calling a step done; refresh the contract
  after API changes; keep model calls on the cheap model; one logical change per
  commit on `main`.
- **Ask first:** adding a dependency; changing the existing chat protocol in a
  way old clients would break; anything that runs without the square open;
  raising the ambient rate above one chat every 3 minutes.
- **Never:** background jobs or cron for this feature; mentors consulting each
  other in the middle of a reply; ledger lines in logs; committing secrets.

## Success Criteria

1. **Step 1:** after telling Buffett my goal and getting advice, Munger's reply
   to a related question references Buffett's advice without me repeating it,
   in Munger's voice. The goal set in the quest log survives a restart.
2. **Step 2:** opening Munger after talking to Buffett starts with Munger
   reacting to Buffett's advice; opening him again with nothing new shows the
   greeting and makes no model call. Bubbles show over mentors I have talked to.
3. **Step 3:** in 15 minutes of play with two eligible mentors, at least one
   ambient chat happens, it is about my goal, and none happen less than 3
   minutes apart or with the square closed or paused.
4. **Step 4:** joining an ambient chat and asking one question gets two
   replies, the second reacting to the first, each typed out under its own
   name plate.
5. Both gates pass after every step.

## Decisions

Settled while planning (see the plan's "Decisions taken in this plan"):

1. Recency for now: the 8 newest lines from other mentors. Relevance later, if
   mentors bring up unrelated advice.
2. Ledger lines can be deleted from the quest log.
3. In a group turn the mentor you walked up to answers first.
4. An exchange with no real advice writes no ledger line.

## Open Questions

None blocking. Revisit decision 1 after Checkpoint A.
