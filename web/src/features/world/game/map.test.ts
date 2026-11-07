import { describe, expect, it } from 'vitest'

import {
  buildWorldMap,
  doorstep,
  isWalkable,
  MAP_COLS,
  MAP_ROWS,
  reachableFrom,
  TILE_KIND_COUNT,
  TileKind,
  tileAt,
} from './map'

const map = buildWorldMap()

describe('world map', () => {
  it('is a full grid of known tile kinds', () => {
    expect(map.tiles).toHaveLength(MAP_ROWS)
    for (const row of map.tiles) {
      expect(row).toHaveLength(MAP_COLS)
      for (const kind of row) {
        expect(kind).toBeGreaterThanOrEqual(0)
        expect(kind).toBeLessThan(TILE_KIND_COUNT)
      }
    }
  })

  it('is fenced in, so nobody can walk off the edge', () => {
    for (let col = 0; col < MAP_COLS; col++) {
      expect(isWalkable(map, { col, row: 0 })).toBe(false)
      expect(isWalkable(map, { col, row: MAP_ROWS - 1 })).toBe(false)
    }
    for (let row = 0; row < MAP_ROWS; row++) {
      expect(isWalkable(map, { col: 0, row })).toBe(false)
      expect(isWalkable(map, { col: MAP_COLS - 1, row })).toBe(false)
    }
  })

  it('lets the player reach every mentor spawn', () => {
    const reachable = reachableFrom(map, map.playerSpawn)
    for (const spawn of map.mentorSpawns) {
      // The spawn is in the expectation so a failure says which one.
      expect({ spawn, reachable: reachable.has(`${spawn.col},${spawn.row}`) }).toEqual({
        spawn,
        reachable: true,
      })
    }
  })

  it('connects every building door to the streets by a path', () => {
    const reachable = reachableFrom(map, map.playerSpawn)
    for (const building of map.buildings) {
      const step = doorstep(building)
      expect({
        building: building.label,
        doorstep: tileAt(map, step),
        reachable: reachable.has(`${step.col},${step.row}`),
      }).toEqual({ building: building.label, doorstep: TileKind.Path, reachable: true })
    }
  })

  it('keeps buildings and the fountain solid', () => {
    for (const building of map.buildings) {
      expect(tileAt(map, building)).toBe(TileKind.Building)
    }
    expect(tileAt(map, map.fountain)).toBe(TileKind.Fountain)
  })

  it('has enough distinct spawn spots for a full roster', () => {
    const keys = new Set(map.mentorSpawns.map((cell) => `${cell.col},${cell.row}`))
    expect(keys.size).toBe(map.mentorSpawns.length)
    expect(map.mentorSpawns.length).toBeGreaterThanOrEqual(8)
  })
})
