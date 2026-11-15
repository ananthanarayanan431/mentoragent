/**
 * Ambient chats: now and then, while the square is open, two mentors who have both
 * advised you meet and talk about your goal. Pure rules; `use-ambient-chats.ts`
 * runs them and the scene walks and draws.
 */

import type { LedgerLine, Mentor } from '@/lib/types'

/** Shortest and longest wait between two chats (the server's floor is 3 minutes). */
export const AMBIENT_MIN_DELAY_MS = 180_000
export const AMBIENT_MAX_DELAY_MS = 300_000

/** A line stays up this long, plus a little per character, up to a cap. */
const LINE_BASE_MS = 1500
const LINE_PER_CHAR_MS = 60
const LINE_MAX_MS = 6000

export type Pair = [visitorId: string, hostId: string]

/** How long after two mentors finish talking you can still join them. */
export const JOIN_WINDOW_MS = 10_000

/** Two mentors meeting in the square, from the walk to a few seconds after. */
export interface Meeting {
  /** The visitor first, then the host. */
  mentorIds: Pair
  /** The stored chat, once the server wrote it; joining continues from it. */
  ambientId: string | null
  /** What they said, in order (empty until the chat arrives). */
  lines: { mentorId: string; text: string }[]
  /** When it ended (ms since epoch); null while it is going on. */
  endedAt: number | null
}

/**
 * The meeting walking up to `mentorId` would join: one they are in, going on or
 * ended less than `JOIN_WINDOW_MS` ago. Null means an ordinary one-on-one talk.
 */
export function joinableMeeting(
  meeting: Meeting | null,
  mentorId: string,
  now: number,
): Meeting | null {
  if (!meeting || !meeting.mentorIds.includes(mentorId)) return null
  if (meeting.endedAt !== null && now - meeting.endedAt >= JOIN_WINDOW_MS) return null
  return meeting
}

/** Every two mentors who have both advised you and are not still reading up. */
export function eligiblePairs(mentors: readonly Mentor[], ledger: readonly LedgerLine[]): Pair[] {
  const advised = new Set(ledger.map((line) => line.mentor_id))
  const ids = mentors
    .filter((mentor) => advised.has(mentor.id) && mentor.memory !== 'building')
    .map((mentor) => mentor.id)
  return ids.flatMap((a, i) => ids.slice(i + 1).map((b): Pair => [a, b]))
}

const samePair = (x: Pair, y: Pair) =>
  (x[0] === y[0] && x[1] === y[1]) || (x[0] === y[1] && x[1] === y[0])

/**
 * A random pair, in a random order (the first walks to the second), avoiding the
 * pair that met last when another can.
 */
export function pickPair(
  pairs: readonly Pair[],
  rng: () => number,
  last: Pair | null,
): Pair | null {
  const fresh = last ? pairs.filter((pair) => !samePair(pair, last)) : pairs
  const pool = fresh.length ? fresh : pairs
  if (!pool.length) return null
  const [a, b] = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!
  return rng() < 0.5 ? [a, b] : [b, a]
}

export function nextDelayMs(rng: () => number): number {
  return AMBIENT_MIN_DELAY_MS + rng() * (AMBIENT_MAX_DELAY_MS - AMBIENT_MIN_DELAY_MS)
}

export function lineDurationMs(text: string): number {
  return Math.min(LINE_MAX_MS, LINE_BASE_MS + text.length * LINE_PER_CHAR_MS)
}
