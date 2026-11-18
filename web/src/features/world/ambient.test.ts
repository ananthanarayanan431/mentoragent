import { describe, expect, it } from 'vitest'

import type { Mentor } from '@/lib/types'
import {
  AMBIENT_MAX_DELAY_MS,
  AMBIENT_MIN_DELAY_MS,
  eligiblePairs,
  JOIN_WINDOW_MS,
  joinableMeeting,
  lineDurationMs,
  lineSchedule,
  MAX_TALK_MS,
  type Meeting,
  nextDelayMs,
  pickPair,
} from './ambient'

function mentor(id: string, memory: Mentor['memory'] = 'ready'): Mentor {
  return { id, name: id, expertise: 'e', perspective: 'p', style: 's', in_square: true, memory }
}

describe('eligiblePairs', () => {
  it('pairs any two mentors (what they talk about is up to the server)', () => {
    expect(eligiblePairs([mentor('a'), mentor('b'), mentor('c')])).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ])
  })

  it('leaves out a mentor who is still reading up', () => {
    expect(eligiblePairs([mentor('a'), mentor('b', 'building')])).toEqual([])
  })
})

describe('pickPair', () => {
  const pairs: [string, string][] = [
    ['a', 'b'],
    ['a', 'c'],
  ]

  it('picks at random, and either can be the visitor', () => {
    expect(pickPair(pairs, () => 0, null)).toEqual(['a', 'b'])
    expect(pickPair(pairs, () => 0.99, null)).toEqual(['c', 'a'])
  })

  it('avoids the pair that just met when another exists', () => {
    expect(pickPair(pairs, () => 0, ['b', 'a'])).toEqual(['a', 'c'])
    expect(pickPair([['a', 'b']], () => 0, ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('is null when nobody can meet', () => {
    expect(pickPair([], () => 0, null)).toBeNull()
  })
})

describe('timing', () => {
  it('waits three to five minutes between chats', () => {
    expect(nextDelayMs(() => 0)).toBe(AMBIENT_MIN_DELAY_MS)
    expect(nextDelayMs(() => 1)).toBe(AMBIENT_MAX_DELAY_MS)
    expect(AMBIENT_MIN_DELAY_MS).toBe(180_000)
  })

  it('leaves a line up long enough to read, but not forever', () => {
    expect(lineDurationMs('Hi.')).toBe(1500 + 3 * 60)
    expect(lineDurationMs('x'.repeat(500))).toBe(6000)
  })
})

describe('joinableMeeting', () => {
  const going: Meeting = {
    mentorIds: ['buffett', 'munger'],
    ambientId: 'a1',
    lines: [],
    endedAt: null,
  }

  it('lets you join two mentors who are talking', () => {
    expect(joinableMeeting(going, 'munger', 1000)).toBe(going)
  })

  it('still lets you join just after they finish, not long after', () => {
    const ended = { ...going, endedAt: 1000 }
    expect(joinableMeeting(ended, 'buffett', 1000 + JOIN_WINDOW_MS - 1)).toBe(ended)
    expect(joinableMeeting(ended, 'buffett', 1000 + JOIN_WINDOW_MS)).toBeNull()
  })

  it('is about the two of them only', () => {
    expect(joinableMeeting(going, 'dalio', 1000)).toBeNull()
    expect(joinableMeeting(null, 'buffett', 1000)).toBeNull()
  })
})

describe('lineSchedule', () => {
  it('gives each line its reading time when they fit in thirty seconds', () => {
    expect(lineSchedule(['Hi.', 'Hello.'])).toEqual([
      lineDurationMs('Hi.'),
      lineDurationMs('Hello.'),
    ])
  })

  it('never lets the mentors talk for more than thirty seconds', () => {
    const times = lineSchedule(Array.from({ length: 8 }, () => 'x'.repeat(200)))
    expect(times).toHaveLength(8)
    expect(times.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(MAX_TALK_MS)
    expect(MAX_TALK_MS).toBe(30_000)
  })
})
