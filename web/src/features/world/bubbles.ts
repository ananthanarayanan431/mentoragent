/**
 * Speech bubbles over mentors: the newest thing each one told you, shown as the
 * player walks past. Pure rules; the scene only draws them.
 */

import type { LedgerLine } from '@/lib/types'

/** Longest bubble text, ellipsis included: a bubble is a hint, not a quote. */
export const BUBBLE_MAX_CHARS = 32

/** Each mentor's newest ledger topic, as bubble text, keyed by mentor id. */
export function bubbleTexts(ledger: readonly LedgerLine[]): Record<string, string> {
  const newest = new Map<string, LedgerLine>()
  for (const line of ledger) {
    const seen = newest.get(line.mentor_id)
    if (!seen || line.created_at > seen.created_at) newest.set(line.mentor_id, line)
  }
  const texts: Record<string, string> = {}
  for (const [mentorId, line] of newest) texts[mentorId] = trim(`Told you about ${line.topic}`)
  return texts
}

function trim(text: string): string {
  return text.length <= BUBBLE_MAX_CHARS ? text : `${text.slice(0, BUBBLE_MAX_CHARS - 1)}…`
}

export interface BubbleView {
  hasText: boolean
  /** Feet-to-feet distance between the player and the mentor. */
  distance: number
  /** How close the player must be to see it. */
  reach: number
  /** In a conversation with the player (the dialogue says it all). */
  talking: boolean
  /** Showing the "Space to talk" prompt, which sits where the bubble would. */
  prompted: boolean
}

export function showBubble({ hasText, distance, reach, talking, prompted }: BubbleView): boolean {
  return hasText && distance <= reach && !talking && !prompted
}
