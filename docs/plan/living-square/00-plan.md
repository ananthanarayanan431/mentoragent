# Implementation Plan: The Living Square

Spec: [docs/specs/living-square.md](../../specs/living-square.md). Idea:
[docs/ideas/living-square.md](../../ideas/living-square.md). Branch:
`feat/living-square`.

## Overview

Make the square one shared world in four steps: an advice ledger and your goal
that every mentor reads (step 1), mentors who speak first and speech bubbles
(step 2), mentors who now and then chat with each other about your goal while
the square is open (step 3), and joining such a chat as a three-way
conversation (step 4). Each step ships on its own; each task leaves both gates
green.

## Decisions taken in this plan

These settle the spec's open questions and the gaps found while planning. The
spec is updated to match.

1. **Recency, not relevance.** Each reply gets the goal plus the 8 newest ledger
   lines from other mentors (`LEDGER_LINES_IN_CONTEXT`).
2. **Ledger lines can be deleted** from the quest log (`DELETE /ledger/{id}`).
3. **In a group turn the mentor you walked up to answers first.**
4. **An exchange with no real advice writes no line** ("hi", small talk): the
   summarizer may return no advice.
5. **Openers do not repeat.** The profile keeps `heard_until[mentor_id]`; a
   mentor opens only when another mentor's line is newer than both their own
   newest line and their `heard_until`.
6. **Writing a ledger line never delays a reply.** The WebSocket route starts it
   as a tracked `asyncio` task after `end`; `POST /chat` uses `BackgroundTasks`.
7. **React decides joining.** The game already emits `talk {mentorId}`; React
   opens a group dialogue instead when that mentor is in a meeting or left one
   less than 10 seconds ago.
8. **New WebSocket messages are told apart by their keys** (`opener: true`,
   `mentor_ids`), so the existing `{mentor_id, message}` shape keeps working.

## Dependency graph

```
01 goal API ─┬─ 02 goal in quest log
             │
03 ledger write ─┬─ 04 ledger API ─┬─ 06 ledger in quest log
                 │                 ├─ 09 speech bubbles
                 └─ 05 mentors read goal + ledger
                          │
                          ├─ 07 opener (agent) ── 08 opener (web)
                          ├─ 10 ambient chat API ─┐
                          │   11 mentors visit each other (game) ─┴─ 12 ambient chats in the square
                          └─ 13 group turn (agent) ── 14 group conversation state (web)
                                                          └── 15 join a conversation (web)
```

## Task list

### Phase 1: Advice ledger and goal (spec step 1)

- [ ] [01 Goal API](01-goal-api.md) (agent, M)
- [ ] [02 Goal in the quest log](02-goal-in-quest-log.md) (web, S)
- [ ] [03 Write a ledger line after each exchange](03-ledger-write.md) (agent, M)
- [ ] [04 Ledger API: list and delete](04-ledger-api.md) (agent, S)
- [ ] [05 Mentors read the goal and the ledger](05-mentor-context.md) (agent, M)
- [ ] [06 Ledger in the quest log](06-ledger-in-quest-log.md) (web, S)

**Checkpoint A** (spec success criterion 1): both gates pass; after telling
Buffett your goal and getting advice, Munger's reply to a related question
builds on or pushes back on it; the goal survives an agent restart. Review with
the human before Phase 2.

### Phase 2: Mentors speak first, speech bubbles (spec step 2)

- [ ] [07 Opener on the WebSocket](07-opener-agent.md) (agent, M)
- [ ] [08 Mentors speak first in the dialogue](08-opener-web.md) (web, M)
- [ ] [09 Speech bubbles](09-speech-bubbles.md) (web, M)

**Checkpoint B** (criterion 2): opening Munger after talking to Buffett starts
with Munger reacting; reopening with nothing new shows the greeting and calls
no model; bubbles show over mentors you have talked to.

### Phase 3: Ambient chats (spec step 3)

- [ ] [10 Ambient chat API](10-ambient-api.md) (agent, M)
- [ ] [11 Mentors visit each other](11-mentor-visits.md) (game, M)
- [ ] [12 Ambient chats in the square](12-ambient-chats-web.md) (web, M)

**Checkpoint C** (criterion 3): 15 minutes of play with two eligible mentors
gives at least one chat about your goal, never less than 3 minutes apart, never
while paused or with the tab closed.

### Phase 4: Join a conversation (spec step 4)

- [ ] [13 Group turn on the WebSocket](13-group-turn-agent.md) (agent, M)
- [ ] [14 Group conversation state](14-group-state-web.md) (web, M)
- [ ] [15 Join a conversation](15-join-conversation-web.md) (web, M)

**Checkpoint D** (criterion 4 and 5): joining an ambient chat and asking one
question gets two replies, the second reacting to the first, each under its own
name plate; both gates pass; the branch is ready for review.

## Parallel work

- Agent and web tasks of the same phase can run side by side once the agent task
  has refreshed the contract (`make -C agents/mentor_agent openapi`): 02 after
  01, 06 and 09 after 04, 08 after 07, 14 after 13.
- 11 (game movement) needs nothing from the agent and can start any time.
- Everything touching `routes/v1/chat.py` (03, 05, 07, 13) is sequential.

## Risks and mitigations

| Risk                                                        | Impact | Mitigation                                                                  |
| ----------------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| Mentors converge and lose their voices after reading others | High   | Prompt rule in 05; check by hand at Checkpoint A with three mentors         |
| A wrong ledger line is repeated by every mentor             | Med    | Short structured lines (03), delete from the quest log (06)                 |
| Ambient chats feel like spam or cost too much               | Med    | Server rate limit (10) plus client timing (12); only on screen and unpaused |
| Group turns are slow (two replies in a row)                 | Med    | Stream both; the second starts the moment the first ends                    |
| The ledger leaks between people if the app is ever shared   | High   | Out of scope (one user, confirmed); accounts come before sharing            |
| `routes/v1/chat.py` grows into a tangle of message kinds    | Low    | One pure `parse_client_message` (07) that returns a typed request per kind  |

## Conventions for every task

- Agent rules: `agents/mentor_agent/CLAUDE.md`. Web rules: `web/CLAUDE.md`.
- Gates: `scripts/ci/python-checks.sh agents/mentor_agent all` and `pnpm check`.
- After any route or schema change: `make -C agents/mentor_agent openapi`, commit
  both contract files.
- Model calls for ledger lines, openers and ambient chats use
  `build_summary_model()` (`LLM_MODEL_CONTEXT_SUMMARY`).
- Conventional Commits, one logical change per commit, on `feat/living-square`.
