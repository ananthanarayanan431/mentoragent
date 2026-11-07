import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadMet, markMet, resetMet } from './progress'

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('world progress', () => {
  it('remembers which mentors were met across loads', () => {
    let met = loadMet()
    met = markMet(met, 'ada')
    met = markMet(met, 'ada')
    met = markMet(met, 'bob')

    expect([...loadMet()].toSorted()).toEqual(['ada', 'bob'])
    expect(met.size).toBe(2)
  })

  it('returns a new set instead of mutating the old one', () => {
    const before = loadMet()
    const after = markMet(before, 'ada')
    expect(before.size).toBe(0)
    expect(after.has('ada')).toBe(true)
  })

  it('ignores corrupt storage and works without storage', () => {
    window.localStorage.setItem('mentoragent:world:met', '{not json')
    expect(loadMet().size).toBe(0)

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(markMet(new Set(), 'ada').has('ada')).toBe(true)
  })

  it('reset forgets everything', () => {
    markMet(new Set(), 'ada')
    expect(resetMet().size).toBe(0)
    expect(loadMet().size).toBe(0)
  })
})
