/**
 * Ambient chats: now and then, while the square is open, two mentors meet. If both
 * have advised you they talk about your goal; otherwise they have a short chat and
 * move on (the server decides). Pure rules; `use-ambient-chats.ts` runs them and the
 * scene walks and draws.
 */

import type { Mentor } from '@/lib/types'

/** Shortest and longest wait between two chats (the server's floor is 3 minutes). */
export const AMBIENT_MIN_DELAY_MS = 180_000
export const AMBIENT_MAX_DELAY_MS = 300_000

/** A line stays up this long, plus a little per character, up to a cap. */
const LINE_BASE_MS = 1500
const LINE_PER_CHAR_MS = 60
const LINE_MAX_MS = 6000
/** The longest a meeting's lines may play, all together. */
export const MAX_TALK_MS = 30_000

export type Pair = [visitorId: string, hostId: string]

/**
 * After a meeting that came to nothing (the walk failed, the server said no),
 * mentors who bump into each other may try again this soon.
 */
export const ENCOUNTER_RETRY_MS = 20_000

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

/** Every two mentors who are not still reading up on their sources. */
export function eligiblePairs(mentors: readonly Mentor[]): Pair[] {
  const ids = mentors.filter((mentor) => mentor.memory !== 'building').map((mentor) => mentor.id)
  return ids.flatMap((a, i) => ids.slice(i + 1).map((b): Pair => [a, b]))
}

export const samePair = (x: Pair, y: Pair) =>
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

/**
 * How long each line stays up: its reading time, shrunk evenly when together they
 * would run past `MAX_TALK_MS`, so a meeting never talks for more than that.
 */
export function lineSchedule(texts: readonly string[]): number[] {
  const wanted = texts.map(lineDurationMs)
  const total = wanted.reduce((sum, ms) => sum + ms, 0)
  if (total <= MAX_TALK_MS) return wanted
  return wanted.map((ms) => Math.floor((ms * MAX_TALK_MS) / total))
}
