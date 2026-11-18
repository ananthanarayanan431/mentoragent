/**
 * Small talk: what two mentors say when one walks up to the other between the
 * square's real (model-written) chats. A quick hello, then both stroll on. Pure
 * functions; the scene shows the lines and times them.
 */

import type { Rng } from './wander'

export type Speaker = 'visitor' | 'host'

export interface GreetingLine {
  speaker: Speaker
  text: string
}

/** `{name}` is the other mentor's first name. */
const EXCHANGES: readonly (readonly [visitor: string, host: string])[] = [
  ['Hello, {name}!', 'Good to see you. Walk with me later?'],
  ['{name}! Out for a stroll too?', 'Always. It clears the head.'],
  ['Ah, {name}.', 'A familiar face! Lovely day for thinking.'],
  ['Hey {name}, what are you reading lately?', 'Too much, as usual. You?'],
  ['{name}, there you are.', 'Here I am. Catch you at the fountain?'],
  ['Good to bump into you, {name}.', 'Likewise. Let us talk properly soon.'],
  ['How is the work going, {name}?', 'Slowly, then all at once.'],
  ['{name}! Got a minute?', 'For you, a few. Then I am off.'],
]

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

/** A short exchange: the visitor speaks first, the host answers. */
export function greetingLines(visitorName: string, hostName: string, rng: Rng): GreetingLine[] {
  const [first, reply] =
    EXCHANGES[Math.min(EXCHANGES.length - 1, Math.floor(rng() * EXCHANGES.length))]!
  return [
    { speaker: 'visitor', text: first.replace('{name}', firstName(hostName)) },
    { speaker: 'host', text: reply.replace('{name}', firstName(visitorName)) },
  ]
}

const LINE_BASE_MS = 1400
const LINE_PER_CHAR_MS = 45
const LINE_MAX_MS = 3500

/** How long a greeting line stays over the speaker's head. */
export function greetingLineMs(text: string): number {
  return Math.min(LINE_MAX_MS, LINE_BASE_MS + text.length * LINE_PER_CHAR_MS)
}
