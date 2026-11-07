import { describe, expect, it } from 'vitest'

import { appearanceFor, hashString } from './appearance'

const MENTORS = ['warren_buffett', 'charlie_munger', 'peter_lynch', 'ray_dalio']

describe('appearanceFor', () => {
  it('is stable for the same id', () => {
    expect(appearanceFor('warren_buffett')).toEqual(appearanceFor('warren_buffett'))
  })

  it('gives the current mentors visibly different outfits', () => {
    const looks = MENTORS.map(appearanceFor)
    const signatures = new Set(looks.map((look) => `${look.outfit}|${look.hair}|${look.hairStyle}`))
    expect(signatures.size).toBe(MENTORS.length)
  })

  it('varies across many ids', () => {
    const outfits = new Set(Array.from({ length: 50 }, (_, i) => appearanceFor(`m${i}`).outfit))
    expect(outfits.size).toBeGreaterThan(4)
  })

  it('only uses CSS hex colours', () => {
    const look = appearanceFor('anyone')
    for (const colour of [look.skin, look.hair, look.outfit, look.trim, look.trousers]) {
      expect(colour).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('hashString', () => {
  it('spreads similar ids apart', () => {
    expect(hashString('a')).not.toBe(hashString('b'))
    expect(hashString('ab')).not.toBe(hashString('ba'))
  })
})
