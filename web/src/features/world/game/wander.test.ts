import { describe, expect, it } from 'vitest'

import {
  facingFor,
  facingTowards,
  findEncounters,
  MENTOR_SPEED_RATIO,
  mentorSpeed,
  nearestWithin,
  pickTarget,
  seededRng,
  startWander,
  stepWander,
  type Point,
  type WanderConfig,
} from './wander'

const start: Point = { x: 100, y: 100 }
const places: Point[] = [start, { x: 400, y: 100 }, { x: 100, y: 400 }, { x: 400, y: 400 }]
const config: WanderConfig = { places, spread: 20, speed: 40 }

/** The first walk target a fresh wander picks with `seed`. */
function firstTarget(seed: number): Point {
  const rng = seededRng(seed)
  return stepWander(startWander(start, rng), config, start, 10_000, rng).state.target
}

const near = (point: Point, place: Point, within: number) =>
  Math.hypot(point.x - place.x, point.y - place.y) <= within + 1e-9

describe('pickTarget', () => {
  it('heads for one of the places, never the one the mentor is already at', () => {
    const rng = seededRng(1)
    const visited = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const target = pickTarget(places, config.spread, start, rng)
      const index = places.findIndex((place) => near(target, place, config.spread))
      expect(index).toBeGreaterThan(0)
      visited.add(index)
    }
    // Over time, every other place gets a visit: nobody stays in one corner.
    expect([...visited].toSorted()).toEqual([1, 2, 3])
  })

  it('still moves when there is only one place', () => {
    const target = pickTarget([start], 20, start, seededRng(2))
    expect(near(target, start, 20)).toBe(true)
  })
})

describe('stepWander', () => {
  it('idles, then walks towards a target at the configured speed, then idles again', () => {
    const rng = seededRng(7)
    let state = startWander(start, rng)
    let position: Point = { ...start }

    // Burn through the idle pause.
    let step = stepWander(state, config, position, 10_000, rng)
    expect(step.state.mode).toBe('walk')
    state = step.state

    step = stepWander(state, config, position, 16, rng)
    expect(Math.hypot(step.velocity.x, step.velocity.y)).toBeCloseTo(config.speed)

    // Walk until arrival, integrating the velocity like the physics engine would.
    for (let i = 0; i < 1000 && step.state.mode === 'walk'; i++) {
      position = {
        x: position.x + (step.velocity.x * 16) / 1000,
        y: position.y + (step.velocity.y * 16) / 1000,
      }
      step = stepWander(step.state, config, position, 16, rng)
    }
    expect(step.state.mode).toBe('idle')
    expect(step.velocity).toEqual({ x: 0, y: 0 })
    // Arrived at another place, far from where the walk began.
    expect(places.slice(1).some((place) => near(position, place, config.spread + 5))).toBe(true)
  })

  it('gives up on a walk when blocked by a wall', () => {
    const rng = seededRng(3)
    const walking = stepWander(startWander(start, rng), config, start, 10_000, rng).state
    const step = stepWander(walking, config, start, 16, rng, true)
    expect(step.state.mode).toBe('idle')
  })

  it('allows long walks across the square, in proportion to the distance', () => {
    const rng = seededRng(5)
    const step = stepWander(startWander(start, rng), config, start, 10_000, rng)
    const distance = Math.hypot(step.state.target.x - start.x, step.state.target.y - start.y)
    expect(step.state.timer).toBeGreaterThan((distance / config.speed) * 1000)
  })

  it('is reproducible with the same seed', () => {
    expect(firstTarget(42)).toEqual(firstTarget(42))
    expect(firstTarget(42)).not.toEqual(firstTarget(43))
  })
})

describe('mentor speed', () => {
  it('is at least three quarters of the player speed, so mentors can be followed', () => {
    expect(MENTOR_SPEED_RATIO).toBeGreaterThanOrEqual(0.75)
    expect(MENTOR_SPEED_RATIO).toBeLessThan(1)
    expect(mentorSpeed(150)).toBe(120)
  })
})

describe('stepWander along a route', () => {
  /** A route that goes via a corner, as round an obstacle. */
  const via = { x: 100, y: 60 }
  const routed: WanderConfig = { ...config, route: (_from, to) => [via, to] }

  it('walks the route waypoint by waypoint', () => {
    const rng = seededRng(7)
    let step = stepWander(startWander(start, rng), routed, start, 10_000, rng)
    expect(step.state.mode).toBe('walk')
    step = stepWander(step.state, routed, start, 16, rng)
    // Heading for the corner first: straight up.
    expect(step.velocity.x).toBeCloseTo(0)
    expect(step.velocity.y).toBeLessThan(0)

    step = stepWander(step.state, routed, via, 16, rng)
    expect(step.state.mode).toBe('walk')
    expect(step.state.waypoints).toEqual([step.state.target])
  })

  it('tries other targets before giving up when one cannot be reached', () => {
    const rng = seededRng(7)
    let calls = 0
    const once: WanderConfig = { ...config, route: (_from, to) => (++calls === 1 ? null : [to]) }
    const step = stepWander(startWander(start, rng), once, start, 10_000, rng)
    expect(step.state.mode).toBe('walk')
    expect(calls).toBe(2)
  })

  it('stays put a little longer when there is no way anywhere', () => {
    const rng = seededRng(7)
    const blocked: WanderConfig = { ...config, route: () => null }
    const step = stepWander(startWander(start, rng), blocked, start, 10_000, rng)
    expect(step.state.mode).toBe('idle')
    expect(step.state.timer).toBeGreaterThan(0)
  })
})

/** A mentor at a point on a line, for encounter tests. */
function at(id: string, x: number, y = 0) {
  return { id, x, y }
}

describe('findEncounters', () => {
  it('lists every pair close enough to notice each other, nearest first', () => {
    expect(findEncounters([at('a', 0), at('b', 100), at('c', 120), at('d', 70)], 35)).toEqual([
      ['b', 'c'],
      ['b', 'd'],
    ])
  })

  it('is empty when everyone keeps their distance', () => {
    expect(findEncounters([at('a', 0), at('b', 100)], 30)).toEqual([])
  })
})

describe('facing', () => {
  it('follows the dominant axis and keeps the current facing when still', () => {
    expect(facingFor({ x: -5, y: 2 }, 'down')).toBe('left')
    expect(facingFor({ x: 1, y: 9 }, 'left')).toBe('down')
    expect(facingFor({ x: 0, y: -3 }, 'left')).toBe('up')
    expect(facingFor({ x: 0, y: 0 }, 'right')).toBe('right')
    expect(facingTowards({ x: 0, y: 0 }, { x: 10, y: 1 })).toBe('right')
  })
})

describe('nearestWithin', () => {
  it('returns the closest candidate inside the radius, or null', () => {
    const a = { id: 'a', x: 10, y: 0 }
    const b = { id: 'b', x: 30, y: 0 }
    expect(nearestWithin({ x: 0, y: 0 }, [b, a], 40)?.id).toBe('a')
    expect(nearestWithin({ x: 0, y: 0 }, [b], 20)).toBeNull()
  })
})
