/**
 * Pure rules for the in-world dialogue box: which exchange it shows, and how
 * fast a reply types itself out. The box shows one exchange at a time, like an
 * RPG text box; the whole conversation stays one click away in the log.
 */

import type { Message } from '@/lib/types'

/** Milliseconds between typewriter steps. */
export const TYPEWRITER_TICK_MS = 30

/** A typewriter that falls this many steps behind catches up instead of crawling. */
const CATCH_UP_STEPS = 40

/** The exchange on screen: the newest mentor line and what the player said before it. */
export interface Exchange {
  question: Message | null
  reply: Message | null
}

/**
 * The newest exchange. The reducer adds an empty, streaming mentor message as
 * soon as the player sends, so the reply exists (blank) while the mentor thinks.
 */
export function currentExchange(messages: readonly Message[]): Exchange {
  const replyIndex = messages.findLastIndex((m) => m.role === 'mentor')
  const lastQuestion = messages.findLastIndex((m) => m.role === 'user')
  if (replyIndex === -1 || lastQuestion > replyIndex) {
    // Nothing answered yet, or a question still waiting for its (blank) reply.
    return { question: messages[lastQuestion] ?? null, reply: null }
  }
  const before = messages.slice(0, replyIndex).findLast((m) => m.role === 'user')
  return { question: before ?? null, reply: messages[replyIndex] ?? null }
}

/** The exchange on screen in a group conversation: your question and the replies. */
export interface GroupExchange {
  question: Message | null
  /** The mentors' replies to it, in the order they spoke. */
  replies: Message[]
}

/** Your newest question and every mentor reply after it. */
export function groupExchange(messages: readonly Message[]): GroupExchange {
  const at = messages.findLastIndex((m) => m.role === 'user')
  if (at === -1) return { question: null, replies: [] }
  return {
    question: messages[at]!,
    replies: messages.slice(at + 1).filter((m) => m.role === 'mentor'),
  }
}

/**
 * How many characters to show after one more tick. One character per tick
 * reads like a typewriter; when streamed text has run far ahead, larger steps
 * keep the reveal from lagging seconds behind the mentor.
 */
export function nextRevealed(revealed: number, length: number): number {
  if (revealed >= length) return length
  const step = Math.max(1, Math.ceil((length - revealed) / CATCH_UP_STEPS))
  return Math.min(length, revealed + step)
}
