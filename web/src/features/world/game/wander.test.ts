import { describe, expect, it } from 'vitest'

import {
  facingFor,
  facingTowards,
  findEncounter,
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

const config: WanderConfig = { home: { x: 100, y: 100 }, radius: 50, speed: 40 }

/** The first walk target a fresh wander picks with `seed`. */
function firstTarget(seed: number): Point {
  const rng = seededRng(seed)
  return stepWander(startWander(config.home, rng), config, config.home, 10_000, rng).state.target
}

describe('pickTarget', () => {
  it('stays within the radius of home', () => {
    const rng = seededRng(1)
    for (let i = 0; i < 500; i++) {
      const target = pickTarget(config.home, config.radius, rng)
      expect(Math.hypot(target.x - 100, target.y - 100)).toBeLessThanOrEqual(config.radius + 1e-9)
    }
  })
})

describe('stepWander', () => {
  it('idles, then walks towards a target at the configured speed, then idles again', () => {
    const rng = seededRng(7)
    let state = startWander(config.home, rng)
    let position: Point = { ...config.home }

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
    expect(Math.hypot(position.x - 100, position.y - 100)).toBeLessThanOrEqual(config.radius + 5)
  })

  it('gives up on a walk when blocked by a wall', () => {
    const rng = seededRng(3)
    const walking = stepWander(
      startWander(config.home, rng),
      config,
      config.home,
      10_000,
      rng,
    ).state
    const step = stepWander(walking, config, config.home, 16, rng, true)
    expect(step.state.mode).toBe('idle')
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
    let step = stepWander(startWander(config.home, rng), routed, config.home, 10_000, rng)
    expect(step.state.mode).toBe('walk')
    step = stepWander(step.state, routed, config.home, 16, rng)
    // Heading for the corner first: straight up.
    expect(step.velocity.x).toBeCloseTo(0)
    expect(step.velocity.y).toBeLessThan(0)

    step = stepWander(step.state, routed, via, 16, rng)
    expect(step.state.mode).toBe('walk')
    expect(step.state.waypoints).toEqual([step.state.target])
  })

  it('stays put a little longer when there is no way to the target', () => {
    const rng = seededRng(7)
    const blocked: WanderConfig = { ...config, route: () => null }
    const step = stepWander(startWander(config.home, rng), blocked, config.home, 10_000, rng)
    expect(step.state.mode).toBe('idle')
    expect(step.state.timer).toBeGreaterThan(0)
  })
})

/** A mentor at a point on a line, for encounter tests. */
function at(id: string, x: number, y = 0) {
  return { id, x, y }
}

describe('findEncounter', () => {
  it('finds two mentors who walk close past each other', () => {
    expect(findEncounter([at('a', 0), at('b', 100), at('c', 120)], 30)).toEqual(['b', 'c'])
  })

  it('is null when everyone keeps their distance', () => {
    expect(findEncounter([at('a', 0), at('b', 100)], 30)).toBeNull()
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
