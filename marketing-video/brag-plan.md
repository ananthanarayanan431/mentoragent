# MentorAgents launch video plan

**What it is:** a pixel-art town where AI mentors, modelled on real experts and
grounded in their own published work, walk around and answer when you walk up to them.

**For:** anyone who wants advice from a specific thinker, not a generic chatbot.

**Angle:** "What would Charlie Munger tell you?" Then show it: walk up, ask, and the
answer streams back in his own words.

**Hook:** the question itself, big, on the logo's dark ground, before any UI.

**Highlights**

1. Mentor Square: walk up to a mentor (real game footage).
2. Ask anything: the reply streams into the dialogue box (real UI).
3. Memory built from their own words (PDFs, Wikipedia, YouTube, X), then
   "Add a mentor": Benjamin Graham arrives in the square (real UI).

**Punchline / outro:** MentorAgents. "Where human expertise meets AI." Open source on GitHub.

**Tone:** default (punchy, clean, a little playful), soft transitions.

**Visual identity:** the app's own tokens: canvas #fdfcf9, ink #2a2622, accent
#b8621b; logo ground #1c1917 with #f0b35a. Inter for type; the game's own pixel
art and monospace labels in the footage.

**Data:** the footage is the real web app (Vite dev server) with a mocked backend.
The four seed mentors and Benjamin Graham come from the repo's own seed files.
Munger's reply is a scripted stand-in made from his well-known published lines
("Invert, always invert"; "It's not supposed to be easy"); no model was called and
no database or user data was used.

## Music

120 BPM (one beat = 15 frames at 30fps), A minor, Am | F | C | G loop, soft
chiptune: triangle bass, rounded square lead, light kick and hats. Effects are
pitched to the key and land on the beat grid: a blip on each cut, quiet ticks under
the typing, a chime when the memory turns ready.

## Storyboard (20s, 600 frames)

| #   | Frames  | Time       | Scene                                                                                                                                                                            |
| --- | ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0-75    | 0.0-2.5s   | Hook: "What would / Charlie Munger / tell you?" rises word-group by group on dark ground                                                                                         |
| 2   | 75-150  | 2.5-5.0s   | Footage: player walks up to Charlie Munger, slow push-in. Caption: "A tiny town of AI mentors."                                                                                  |
| 3   | 150-330 | 5.0-11.0s  | Camera glides into the dialogue box: question typed, answer streams. Caption: "Ask anything. Answers come from their own published work."                                        |
| 4   | 330-405 | 11.0-13.5s | Light canvas: source chips (PDFs, Wikipedia, YouTube, X posts) fly into Benjamin Graham's card; badge flips to "Memory ready" on beat 26. Caption: "Built from their own words." |
| 5   | 405-465 | 13.5-15.5s | Footage punch-in: "Benjamin Graham has arrived in the square!" toast and the quest log. Caption: "New mentors join anytime."                                                     |
| 6   | 465-600 | 15.5-20.0s | Outro: logo, MentorAgents wordmark, tagline, GitHub URL                                                                                                                          |

Every cut lands on a beat (75, 150, 330, 405, 465).
