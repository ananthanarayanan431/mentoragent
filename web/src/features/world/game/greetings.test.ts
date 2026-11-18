import { describe, expect, it } from 'vitest'

import { greetingLineMs, greetingLines } from './greetings'
import { seededRng } from './wander'

describe('greetingLines', () => {
  it('has the visitor speak first, by the host first name, and the host answer', () => {
    for (let seed = 1; seed < 40; seed++) {
      const lines = greetingLines('Ada Lovelace', 'Alan Turing', seededRng(seed))
      expect(lines.map((line) => line.speaker)).toEqual(['visitor', 'host'])
      for (const line of lines) {
        expect(line.text).not.toContain('{name}')
        expect(line.text).not.toContain('Lovelace')
        expect(line.text).not.toContain('Turing')
      }
    }
  })

  it('varies from one meeting to the next', () => {
    const openers = new Set(
      Array.from({ length: 40 }, (_, seed) => greetingLines('A', 'B', seededRng(seed))[0]!.text),
    )
    expect(openers.size).toBeGreaterThan(3)
  })
})

describe('greetingLineMs', () => {
  it('gives longer lines longer, within a cap', () => {
    expect(greetingLineMs('Hi')).toBeLessThan(greetingLineMs('A much longer line to read'))
    expect(greetingLineMs('x'.repeat(500))).toBeLessThanOrEqual(3500)
  })
})
