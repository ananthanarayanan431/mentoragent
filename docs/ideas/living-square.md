# The Living Square

## Problem Statement

How might we make every mentor in the square aware of your goal and of the
advice the others have given you, so that walking through the square feels
like a room of advisors who have been listening, not a menu of separate
chatbots?

Today every mentor is sealed off: a conversation lives in its own
`mentor:conversation` thread, the browser keeps history per mentor, and each
mentor's long-term memory searches only their own sources. Tell Buffett your
goal, walk over to Munger, and Munger has never heard of you.

## Recommended Direction

Build it in four steps, in this order. Each step ships on its own and is
useful before the next one exists; without step 1, the later steps are
mentors talking about nothing.

1. **Advice ledger and your goal.** You write your goal once. After every
   exchange the existing summarizer writes one line to a shared ledger: who
   said what, on which topic (_"Buffett → you, on retirement: index funds,
   don't time the market."_). Before every reply, each mentor gets the goal
   and the relevant ledger lines through the existing `mentor_context` slot,
   with one rule: mention another mentor only to build on them or push back,
   in your own voice.
2. **Mentors speak first, and speech bubbles.** When you walk up to a mentor
   who has heard something relevant, they open with it (_"I hear Charlie told
   you to concentrate your bets. Careful with that."_); otherwise the normal
   greeting shows. Small bubbles over mentors, taken from the ledger, hint at
   what they think as you walk past (_"Told you about moats"_). Bubbles cost no
   model calls.
3. **Mentors chat with each other while they wander.** Now and then two
   mentors you have talked to stop and talk about your goal, and you overhear
   it. Only while the square is open in the browser: the game triggers it, so
   there is no background job, no cron and nothing running when the tab is
   closed. Rare (about one every few minutes) and one model call writes both
   sides of a short exchange.
4. **Join their conversation.** Walk up to two mentors who are talking, press
   Space, and you are in: each of your messages gets a reply from both, the
   second reacting to the first. The RPG dialogue box shows one speaker at a
   time, with a name plate per speaker and Space to advance.

## Key Assumptions to Validate

- [ ] **Ledger lines are accurate and short.** Run the summarizer over existing
      conversations and read the lines it writes; a wrong line gets repeated by
      every mentor.
- [ ] **Mentors keep their own voices** when they read each other's advice. Ask
      three mentors the same question with a shared ledger and check they do
      not drift into agreeing.
- [ ] **References feel relevant, not repetitive.** In a 10-turn conversation a
      mentor should mention another mentor only when it changes the answer.
- [ ] **Ambient chats feel alive, not like spam.** Play for 15 minutes at about
      one chat every 3 to 5 minutes and adjust.
- [ ] **One user.** True for now (confirmed); false the moment anyone else uses
      the app, because the goal and ledger are shared on the server.

## MVP Scope

Steps 1 and 2: your goal, the advice ledger, mentors reading it before every
reply, mentors opening with what they have heard, and speech bubbles. Steps 3
and 4 follow directly and reuse all of it.

## Not Doing (and Why)

- **Chats that are not about your goal.** They cost money and add nothing;
  every ambient line is about you.
- **Mentors consulting each other in the middle of an answer.** Slow, doubles
  the cost of every reply, and the ledger gives the same awareness for free.
- **Anything running while the square is closed.** No background jobs or cron;
  the square is alive only while you are in it.
- **A separate goal-board screen.** The ledger and the bubbles show the same
  thing inside the game.
- **Conversations with three or more mentors.** Two mentors and you is a
  conversation; more is a seminar, and the cost multiplies.
- **Accounts and per-user memory.** Not needed for one user; the first thing to
  add before the app is shared.

## Open Questions

- Is the goal one free-text line, or a few fields (goal, situation,
  constraints)?
- Should you be able to keep a ledger line between you and one mentor?
- Should ambient chats also land in the ledger, so a mentor can say "as I told
  Ray yesterday"?
