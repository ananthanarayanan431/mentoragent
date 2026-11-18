import { describe, expect, it } from 'vitest'

import { CLOUD_TRAIL_DROP, cloudShape } from './cloud'

describe('cloudShape', () => {
  it('puts the body exactly under the text, bottom-centre at the origin', () => {
    const { body } = cloudShape(120, 16)
    expect(body).toMatchObject({ x: -60, y: -16, w: 120, h: 16 })
  })

  it('rings the body with more puffs for longer text', () => {
    expect(cloudShape(200, 16).puffs.length).toBeGreaterThan(cloudShape(60, 16).puffs.length)
  })

  it('keeps every puff centred on the body edge, inside its width', () => {
    for (const puff of cloudShape(120, 16).puffs) {
      expect(Math.abs(puff.x)).toBeLessThanOrEqual(60)
      expect(puff.y).toBeGreaterThanOrEqual(-16)
      expect(puff.y).toBeLessThanOrEqual(0)
    }
  })

  it('trails shrinking dots below the cloud, within the drop to the speaker', () => {
    const { trail } = cloudShape(120, 16)
    expect(trail).toHaveLength(2)
    expect(trail[0]!.r).toBeGreaterThan(trail[1]!.r)
    expect(trail[1]!.y).toBeGreaterThan(trail[0]!.y)
    for (const dot of trail) expect(dot.y + dot.r).toBeLessThanOrEqual(CLOUD_TRAIL_DROP + 2)
  })
})
