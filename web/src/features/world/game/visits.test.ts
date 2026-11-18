import { describe, expect, it } from 'vitest'

import { buildWorldMap, cellCenter, mentorSpawnSpots, TileKind, type WorldMap } from './map'
import { findPath, meetingCell, startVisit, stepVisit, VISIT_TIMEOUT_MS } from './visits'

const G = TileKind.Grass
const H = TileKind.Hedge

/** A small map: '.' grass, '#' hedge. */
function mapOf(rows: string[]): WorldMap {
  return {
    tiles: rows.map((row) => [...row].map((c) => (c === '#' ? H : G))),
    buildings: [],
    fountain: { col: 0, row: 0, cols: 0, rows: 0 },
    playerSpawn: { col: 0, row: 0 },
    mentorSpawns: [],
    places: [],
  }
}

describe('findPath', () => {
  it('walks around a hedge', () => {
    const map = mapOf(['.....', '.###.', '.....'])
    const path = findPath(map, { col: 0, row: 1 }, { col: 4, row: 1 })
    expect(path).not.toBeNull()
    expect(path!.at(-1)).toEqual({ col: 4, row: 1 })
    expect(path!.every((cell) => map.tiles[cell.row]![cell.col] === G)).toBe(true)
    expect(path).toHaveLength(6) // up, across three, down... the shortest way round
  })

  it('gives up when the goal is walled off', () => {
    const map = mapOf(['..#..', '..#..'])
    expect(findPath(map, { col: 0, row: 0 }, { col: 4, row: 0 })).toBeNull()
  })

  it('is empty when already there', () => {
    expect(findPath(mapOf(['...']), { col: 1, row: 0 }, { col: 1, row: 0 })).toEqual([])
  })
})

describe('meetingCell', () => {
  it('is a free cell beside the host, on the visitor side', () => {
    const map = mapOf(['.....', '.....', '.....'])
    expect(meetingCell(map, { col: 2, row: 1 }, { col: 0, row: 1 })).toEqual({ col: 1, row: 1 })
  })

  it('goes round to another side when that one is blocked', () => {
    const map = mapOf(['.....', '.#...', '.....'])
    const cell = meetingCell(map, { col: 2, row: 1 }, { col: 0, row: 1 })
    expect(cell).not.toEqual({ col: 1, row: 1 })
    expect(cell).not.toBeNull()
  })

  it('is null when the host is boxed in', () => {
    expect(
      meetingCell(mapOf(['.#.', '#.#', '.#.']), { col: 1, row: 1 }, { col: 0, row: 0 }),
    ).toBeNull()
  })
})

describe('a visit', () => {
  const map = mapOf(['.....', '.....', '.....'])
  const visitor = cellCenter({ col: 0, row: 1 })
  const host = cellCenter({ col: 4, row: 1 })

  it('walks to the host and arrives', () => {
    let state = startVisit(map, visitor, host)!
    let position = visitor
    let arrived = false
    for (let frame = 0; frame < 200 && !arrived; frame += 1) {
      const step = stepVisit(state, position, 50, 100)
      state = step.state
      position = { x: position.x + step.velocity.x * 0.05, y: position.y + step.velocity.y * 0.05 }
      arrived = step.arrived
      expect(step.failed).toBe(false)
    }
    expect(arrived).toBe(true)
    expect(Math.abs(position.x - cellCenter({ col: 3, row: 1 }).x)).toBeLessThanOrEqual(4)
  })

  it('fails when stuck, rather than walking into a wall forever', () => {
    const state = startVisit(map, visitor, host)!
    expect(stepVisit(state, visitor, VISIT_TIMEOUT_MS + 1, 100).failed).toBe(true)
  })

  it('cannot start when there is no way to the host', () => {
    expect(
      startVisit(mapOf(['..#..']), cellCenter({ col: 0, row: 0 }), cellCenter({ col: 4, row: 0 })),
    ).toBeNull()
  })

  it('can reach every mentor from every other in the real square', () => {
    const square = buildWorldMap()
    const spots = mentorSpawnSpots(square, 6).map(cellCenter)
    const pairs = spots.flatMap((from) => spots.filter((to) => to !== from).map((to) => [from, to]))
    const unreachable = pairs.filter(([from, to]) => startVisit(square, from!, to!) === null)
    expect(unreachable).toEqual([])
  })
})
