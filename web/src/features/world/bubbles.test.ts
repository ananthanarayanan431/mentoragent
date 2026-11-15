import { describe, expect, it } from 'vitest'

import type { LedgerLine } from '@/lib/types'
import { BUBBLE_MAX_CHARS, bubbleTexts, showBubble } from './bubbles'

function line(mentorId: string, topic: string, at: string): LedgerLine {
  return {
    id: `${mentorId}-${at}`,
    mentor_id: mentorId,
    mentor_name: mentorId,
    topic,
    advice: 'Some advice.',
    created_at: at,
  }
}

describe('bubbleTexts', () => {
  it('gives each mentor their newest topic', () => {
    const ledger = [
      line('buffett', 'index funds', '2026-11-15T10:05:00Z'),
      line('munger', 'concentration', '2026-11-15T10:04:00Z'),
      line('buffett', 'moats', '2026-11-15T10:01:00Z'),
    ]
    expect(bubbleTexts(ledger)).toEqual({
      buffett: 'Told you about index funds',
      munger: 'Told you about concentration',
    })
  })

  it('trims a long topic so the bubble stays small', () => {
    const text = bubbleTexts([
      line('dalio', 'how to think about debt cycles', '2026-11-15T10:00:00Z'),
    ]).dalio!
    expect(text).toHaveLength(BUBBLE_MAX_CHARS)
    expect(text.endsWith('…')).toBe(true)
  })

  it('is empty when nobody has told you anything', () => {
    expect(bubbleTexts([])).toEqual({})
  })
})

describe('showBubble', () => {
  const base = { hasText: true, distance: 40, reach: 100, talking: false, prompted: false }

  it('shows when the player is close to a mentor with something to say', () => {
    expect(showBubble(base)).toBe(true)
  })

  it('hides when there is nothing to say, the player is far, or they are talking', () => {
    expect(showBubble({ ...base, hasText: false })).toBe(false)
    expect(showBubble({ ...base, distance: 101 })).toBe(false)
    expect(showBubble({ ...base, talking: true })).toBe(false)
  })

  it('makes room for the "Space to talk" prompt', () => {
    expect(showBubble({ ...base, prompted: true })).toBe(false)
  })
})
