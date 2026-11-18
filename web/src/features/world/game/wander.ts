/**
 * How a mentor roams the square: pause a moment, pick one of the square's places
 * (the library steps, the pond, the café...), walk there round obstacles, pause
 * again. Mentors are not tied to one corner: over time each of them visits them all.
 * Pure functions over plain state; the scene applies the velocity.
 */

export interface Point {
  x: number
  y: number
}

export type Rng = () => number

/** Mentors walk at this share of the player's speed: easy to follow, never faster. */
export const MENTOR_SPEED_RATIO = 0.8

export function mentorSpeed(playerSpeed: number): number {
  return Math.round(playerSpeed * MENTOR_SPEED_RATIO)
}

export interface WanderState {
  mode: 'idle' | 'walk'
  target: Point
  /** Points still to pass through on the way to `target` (which is the last). */
  waypoints: Point[]
  /** Milliseconds left in the current idle pause, or before giving up on a walk. */
  timer: number
}

export interface WanderConfig {
  /** Where mentors like to go; each walk heads for one of these (never empty). */
  places: readonly Point[]
  /** How far from the chosen place the actual target may be, in pixels. */
  spread: number
  /** Walking speed, pixels per second. */
  speed: number
  /**
   * The way from one point to another round obstacles, ending at the destination;
   * null when there is none. Without it, mentors walk straight at their target.
   */
  route?: (from: Point, to: Point) => Point[] | null
}

const ARRIVED_PX = 4
const MIN_IDLE_MS = 600
const MAX_IDLE_MS = 2500
/** Targets to try (some land in a hedge or the pond) before standing a while. */
const TARGET_TRIES = 6
/** A walk may take this many times its plain walking time before it counts as stuck. */
const WALK_SLACK = 2
const WALK_GRACE_MS = 3000

export function startWander(position: Point, rng: Rng): WanderState {
  return { mode: 'idle', target: position, waypoints: [], timer: idleTime(rng) }
}

function idleTime(rng: Rng): number {
  return MIN_IDLE_MS + rng() * (MAX_IDLE_MS - MIN_IDLE_MS)
}

/** A random point within `radius` of `center`, uniform over the disc. */
function nearPoint(center: Point, radius: number, rng: Rng): Point {
  const angle = rng() * Math.PI * 2
  const distance = Math.sqrt(rng()) * radius
  return { x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance }
}

/**
 * A point near one of `places`, chosen at random but never the place the mentor is
 * already at (when there is another), so every walk goes somewhere new.
 */
export function pickTarget(
  places: readonly Point[],
  spread: number,
  position: Point,
  rng: Rng,
): Point {
  const nearest = nearestIndex(places, position)
  const others = places.length > 1 ? places.filter((_, index) => index !== nearest) : places
  const place = others[Math.min(others.length - 1, Math.floor(rng() * others.length))]!
  return nearPoint(place, spread, rng)
}

function nearestIndex(places: readonly Point[], position: Point): number {
  let best = -1
  let bestDistance = Infinity
  places.forEach((place, index) => {
    const distance = Math.hypot(place.x - position.x, place.y - position.y)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/** Length of the walk from `from` through `waypoints`, in pixels. */
function walkLength(from: Point, waypoints: readonly Point[]): number {
  let length = 0
  let at = from
  for (const point of waypoints) {
    length += Math.hypot(point.x - at.x, point.y - at.y)
    at = point
  }
  return length
}

export interface WanderStep {
  state: WanderState
  velocity: Point
}

/**
 * Advances the wander by `deltaMs`.
 *
 * @param position Where the mentor is now.
 * @param blocked True when the mentor tried to move last frame but did not (a wall).
 */
export function stepWander(
  state: WanderState,
  config: WanderConfig,
  position: Point,
  deltaMs: number,
  rng: Rng,
  blocked = false,
): WanderStep {
  const still = { x: 0, y: 0 }

  const rest = (): WanderStep => ({
    state: { mode: 'idle', target: position, waypoints: [], timer: idleTime(rng) },
    velocity: still,
  })

  if (state.mode === 'idle') {
    const timer = state.timer - deltaMs
    if (timer > 0) return { state: { ...state, timer }, velocity: still }
    for (let attempt = 0; attempt < TARGET_TRIES; attempt += 1) {
      const wanted = pickTarget(config.places, config.spread, position, rng)
      const waypoints = config.route ? config.route(position, wanted) : [wanted]
      // No way there (inside a hedge, across water): try another.
      if (!waypoints?.length) continue
      const walkMs = (walkLength(position, waypoints) / config.speed) * 1000
      return {
        state: {
          mode: 'walk',
          target: waypoints.at(-1)!,
          waypoints,
          timer: walkMs * WALK_SLACK + WALK_GRACE_MS,
        },
        velocity: still,
      }
    }
    return rest()
  }

  const timer = state.timer - deltaMs
  if (blocked || timer <= 0) return rest()
  let waypoints = state.waypoints
  while (
    waypoints.length &&
    Math.hypot(waypoints[0]!.x - position.x, waypoints[0]!.y - position.y) <= ARRIVED_PX
  ) {
    waypoints = waypoints.slice(1)
  }
  const next = waypoints[0]
  if (!next) return rest()
  const dx = next.x - position.x
  const dy = next.y - position.y
  const distance = Math.hypot(dx, dy)
  return {
    state: { ...state, waypoints, timer },
    velocity: { x: (dx / distance) * config.speed, y: (dy / distance) * config.speed },
  }
}

/** Which way a character faces when moving with `velocity` (horizontal wins ties). */
export type Facing = 'down' | 'up' | 'left' | 'right'

export function facingFor(velocity: Point, current: Facing): Facing {
  if (velocity.x === 0 && velocity.y === 0) return current
  if (Math.abs(velocity.x) >= Math.abs(velocity.y)) return velocity.x < 0 ? 'left' : 'right'
  return velocity.y < 0 ? 'up' : 'down'
}

/** The facing that looks from `from` towards `to`. */
export function facingTowards(from: Point, to: Point): Facing {
  return facingFor({ x: to.x - from.x, y: to.y - from.y }, 'down')
}

/** The nearest of `candidates` within `radius` of `point`, or null. */
export function nearestWithin<T extends Point>(
  point: Point,
  candidates: readonly T[],
  radius: number,
): T | null {
  let best: T | null = null
  let bestDistance = radius
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)
    if (distance <= bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

/**
 * Every two mentors within `reach` of each other (close enough to notice one
 * another), nearest pairs first. One of them may walk over and say hello.
 */
export function findEncounters<T extends Point & { id: string }>(
  mentors: readonly T[],
  reach: number,
): [string, string][] {
  const pairs: { ids: [string, string]; distance: number }[] = []
  for (let i = 0; i < mentors.length; i += 1) {
    for (let j = i + 1; j < mentors.length; j += 1) {
      const a = mentors[i]!
      const b = mentors[j]!
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (distance <= reach) pairs.push({ ids: [a.id, b.id], distance })
    }
  }
  return pairs.toSorted((x, y) => x.distance - y.distance).map((pair) => pair.ids)
}

/** A small seeded generator (mulberry32), so wandering is reproducible in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
