import { describe, expect, it } from 'vitest'

import { timeAgo } from './format'

const NOW = Date.parse('2026-11-18T12:00:00Z')

describe('timeAgo', () => {
  it('reads like a person would say it', () => {
    expect(timeAgo('2026-11-18T11:59:30Z', NOW)).toBe('just now')
    expect(timeAgo('2026-11-18T11:55:00Z', NOW)).toBe('5 minutes ago')
    expect(timeAgo('2026-11-17T12:00:00Z', NOW)).toBe('yesterday')
    expect(timeAgo('2026-10-28T12:00:00Z', NOW)).toBe('3 weeks ago')
  })

  it('is empty for a date it cannot read', () => {
    expect(timeAgo('not a date', NOW)).toBe('')
  })
})
