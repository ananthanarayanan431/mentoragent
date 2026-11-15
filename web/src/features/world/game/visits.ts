/**
 * One mentor visiting another: find a free cell beside the host, a path to it
 * round trees and hedges, and walk it. Pure functions over plain state; the scene
 * applies the velocity and decides when to start or stop.
 */

import { cellCenter, isWalkable, TILE, type Cell, type WorldMap } from './map'
import type { Point } from './wander'

/** A visit that takes longer than this is stuck (someone in the way); give up. */
export const VISIT_TIMEOUT_MS = 15_000
const ARRIVED_PX = 4

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

const key = (cell: Cell) => `${cell.col},${cell.row}`

export function cellOf(point: Point): Cell {
  return { col: Math.floor(point.x / TILE), row: Math.floor(point.y / TILE) }
}

/**
 * The shortest walkable path from `from` to `to` (4-neighbour, breadth first),
 * excluding `from` and ending with `to`; null when `to` cannot be reached.
 */
export function findPath(map: WorldMap, from: Cell, to: Cell): Cell[] | null {
  if (key(from) === key(to)) return []
  if (!isWalkable(map, to)) return null
  const cameFrom = new Map<string, Cell | null>([[key(from), null]])
  const queue: Cell[] = [from]
  while (queue.length) {
    const cell = queue.shift()!
    for (const [dc, dr] of STEPS) {
      const next = { col: cell.col + dc, row: cell.row + dr }
      if (cameFrom.has(key(next)) || !isWalkable(map, next)) continue
      cameFrom.set(key(next), cell)
      if (key(next) === key(to)) return trace(cameFrom, next)
      queue.push(next)
    }
  }
  return null
}

function trace(cameFrom: Map<string, Cell | null>, end: Cell): Cell[] {
  const path: Cell[] = []
  for (let cell: Cell | null = end; cell; cell = cameFrom.get(key(cell)) ?? null) path.push(cell)
  path.pop() // the start
  return path.toReversed()
}

/** A free cell next to the host, the one nearest the visitor; null if boxed in. */
export function meetingCell(map: WorldMap, host: Cell, visitor: Cell): Cell | null {
  const around = STEPS.map(([dc, dr]) => ({ col: host.col + dc, row: host.row + dr })).filter(
    (cell) => isWalkable(map, cell),
  )
  around.sort(
    (a, b) =>
      Math.hypot(a.col - visitor.col, a.row - visitor.row) -
      Math.hypot(b.col - visitor.col, b.row - visitor.row),
  )
  return around[0] ?? null
}

export interface VisitState {
  /** Cell centres still to walk through, the last being beside the host. */
  waypoints: Point[]
  /** Milliseconds left before the visit counts as stuck. */
  timer: number
}

/** Plans a walk from the visitor to beside the host; null when there is no way. */
export function startVisit(map: WorldMap, visitor: Point, host: Point): VisitState | null {
  const from = cellOf(visitor)
  const spot = meetingCell(map, cellOf(host), from)
  if (!spot) return null
  const path = findPath(map, from, spot)
  if (!path) return null
  return { waypoints: path.map(cellCenter), timer: VISIT_TIMEOUT_MS }
}

export interface VisitStep {
  state: VisitState
  velocity: Point
  /** Beside the host: stop and face them. */
  arrived: boolean
  /** Stuck for too long: give up. */
  failed: boolean
}

/**
 * Advances the walk by `deltaMs` at `speed` pixels per second. Bumping into someone
 * does not fail the visit at once (they may step aside); only the timer does.
 */
export function stepVisit(
  state: VisitState,
  position: Point,
  deltaMs: number,
  speed: number,
): VisitStep {
  const still = { x: 0, y: 0 }
  const timer = state.timer - deltaMs
  if (timer <= 0) {
    return { state: { ...state, timer }, velocity: still, arrived: false, failed: true }
  }
  let waypoints = state.waypoints
  while (waypoints.length) {
    const next = waypoints[0]!
    if (Math.hypot(next.x - position.x, next.y - position.y) > ARRIVED_PX) break
    waypoints = waypoints.slice(1)
  }
  const next = waypoints[0]
  if (!next) {
    return { state: { waypoints, timer }, velocity: still, arrived: true, failed: false }
  }
  const dx = next.x - position.x
  const dy = next.y - position.y
  const distance = Math.hypot(dx, dy)
  return {
    state: { waypoints, timer },
    velocity: { x: (dx / distance) * speed, y: (dy / distance) * speed },
    arrived: false,
    failed: false,
  }
}
