import { describe, expect, it } from 'vitest'

import { appearanceFor, hashString } from './appearance'

const MENTORS = ['warren_buffett', 'charlie_munger', 'peter_lynch', 'ray_dalio']

describe('appearanceFor', () => {
  it('is stable for the same id', () => {
    expect(appearanceFor('warren_buffett')).toEqual(appearanceFor('warren_buffett'))
  })

  it('makes every two of the current mentors look clearly different', () => {
    // "Clearly": at least two of the attributes you see first differ (outfit, hair
    // colour, skin, accessory). Hair style alone is too subtle at game size.
    const looks = MENTORS.map(appearanceFor)
    for (let i = 0; i < looks.length; i++) {
      for (let j = i + 1; j < looks.length; j++) {
        const a = looks[i]!
        const b = looks[j]!
        const differences = (['outfit', 'hair', 'skin', 'accessory'] as const).filter(
          (key) => a[key] !== b[key],
        )
        // The pair is in the expectation so a failure says which two look alike.
        const pair = [MENTORS[i], MENTORS[j]]
        expect({ pair, clearlyDifferent: differences.length >= 2 }).toEqual({
          pair,
          clearlyDifferent: true,
        })
      }
    }
  })

  it('gives each attribute its own variety across many ids', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `mentor_${i}`)
    for (const key of ['outfit', 'hair', 'skin', 'accessory'] as const) {
      expect(new Set(ids.map((id) => appearanceFor(id)[key])).size).toBeGreaterThan(3)
    }
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

  it('keeps the hat for the player, so they stand out', () => {
    const accessories = new Set(
      Array.from({ length: 200 }, (_, i) => appearanceFor(`m${i}`).accessory),
    )
    expect(accessories.has('hat')).toBe(false)
  })
})
