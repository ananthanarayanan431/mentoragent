# MentorAgents launch video plan

**What it is:** bring great minds back to life and ask what they think. Each
mentor is modelled on a real person and answers from that person's own work.
They know your goal, remember what the other mentors told you, talk to each
other, and let you join in.

**For:** anyone who wants advice from a specific thinker, not a generic chatbot.

**Angle:** "What would Einstein think of your idea?" Then show it: create
Einstein from just his name, ask him, hear Munger build on what Einstein said,
watch two mentors talk, and ask both at once.

**Hook:** the question itself, big, on the logo's dark ground, before any UI.

**Highlights**

1. Create a mentor: type "Albert Einstein"; the memory builds from Wikipedia,
   YouTube, PDFs and a web search (real UI).
2. Ask what they think: Einstein answers "Is my startup idea crazy?" (real UI).
3. They know what the others told you: Munger's reply builds on Einstein's
   advice, which the backend gives every mentor (your goal plus the newest
   advice from the others).
4. They talk to each other: Buffett walks over to Munger and they chat.
5. Join in: one question, two answers; the second mentor has read the first.

**Punchline / outro:** MentorAgents. "Bring great minds to life. Ask what they
think." Open source on GitHub.

**Tone:** default (punchy, clean, a little playful), soft transitions.

**Visual identity:** the app's own tokens: canvas #fdfcf9, ink #2a2622, accent
#b8621b; logo ground #1c1917 with #f0b35a. Inter for type; the game's pixel art
and monospace labels in the footage.

**Data:** all footage is the real web app (Vite dev server) with a mocked
backend; no model, database or user data was used. The goal ("Start my first
company"), the advice ledger line and every reply are scripted. Direct answers
use the person's well-known published lines (Einstein: "If at first the idea is
not absurd, then there is no hope for it", "Imagination is more important than
knowledge"; Buffett: "never risk what you have and need for what you don't have
and don't need"). The lines where one mentor refers to another are written to
show the feature.

## Music

120 BPM (one beat = 15 frames at 30fps), A minor, Am | F | C | G loop, soft
chiptune: triangle bass, rounded square lead, light kick and hats. Effects are
pitched to the key and land on the beat grid: a blip on each cut, quiet ticks
under each typing passage, a chime when the memory turns ready.

## Storyboard (25.5s, 765 frames)

| #   | Frames  | Time       | Scene                                                                                                    |
| --- | ------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| 1   | 0-75    | 0.0-2.5s   | Hook: "What would / Einstein / think of your idea?"                                                      |
| 2   | 75-165  | 2.5-5.5s   | Mentors page: "Albert Einstein" typed into Create a mentor. "Bring anyone back to life."                 |
| 3   | 165-225 | 5.5-7.5s   | Source chips fly into Einstein's card; "Memory ready" on beat 14. "Built from their own words."          |
| 4   | 225-360 | 7.5-12.0s  | Square: "Is my startup idea crazy?" and Einstein's answer streams. "Ask what they think."                |
| 5   | 360-465 | 12.0-15.5s | Munger: "I hear Einstein told you to chase the absurd idea..." "They know what the others told you."     |
| 6   | 465-525 | 15.5-17.5s | Buffett and Munger meet; speech line over them. "They talk to each other."                               |
| 7   | 525-675 | 17.5-22.5s | Join: "Should I quit my job for it?" Munger answers, then Buffett: "Charlie's right..." "Ask them both." |
| 8   | 675-765 | 22.5-25.5s | Outro: logo, wordmark, tagline, GitHub URL                                                               |

Every cut lands on a beat (75, 165, 225, 360, 465, 525, 675).

## Rebuild

`work/film.mjs` films the shots (needs `pnpm dev` and Playwright),
`work/render.mjs` renders `work/comp.html` to frames, and `work/music.py` writes
the soundtrack; ffmpeg then muxes frames and audio into `brag.mp4`.
