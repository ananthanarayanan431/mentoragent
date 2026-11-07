/**
 * Mentor Square: the world map, built from named shapes rather than a hand-typed
 * grid so it stays easy to edit. Pure data and functions; Phaser only draws it.
 */

export const TILE = 32
export const MAP_COLS = 44
export const MAP_ROWS = 32

/** Tile kinds, in tileset order (the index is the tile's frame in the tileset texture). */
export const TileKind = {
  Grass: 0,
  Flowers: 1,
  Path: 2,
  Plaza: 3,
  Water: 4,
  Tree: 5,
  Hedge: 6,
  Bench: 7,
  Lamp: 8,
  Building: 9,
  Fountain: 10,
} as const
export type TileKind = (typeof TileKind)[keyof typeof TileKind]

export const TILE_KIND_COUNT = 11

const BLOCKING: ReadonlySet<TileKind> = new Set<TileKind>([
  TileKind.Water,
  TileKind.Tree,
  TileKind.Hedge,
  TileKind.Bench,
  TileKind.Lamp,
  TileKind.Building,
  TileKind.Fountain,
])

export function isBlocking(kind: TileKind): boolean {
  return BLOCKING.has(kind)
}

export interface Cell {
  col: number
  row: number
}

export interface Rect extends Cell {
  cols: number
  rows: number
}

export type BuildingKind = 'library' | 'market' | 'cafe'

export interface Building extends Rect {
  kind: BuildingKind
  label: string
  /** The door is always in the south wall, the one the 3/4 view shows; a path leads to it. */
  door: 'south'
}

export interface WorldMap {
  /** tiles[row][col] */
  tiles: TileKind[][]
  buildings: Building[]
  fountain: Rect
  playerSpawn: Cell
  /** Where mentors start, in order; the first mentor gets the first spot. */
  mentorSpawns: Cell[]
}

const BUILDINGS: Building[] = [
  { kind: 'library', label: 'Library', col: 4, row: 2, cols: 8, rows: 6, door: 'south' },
  { kind: 'market', label: 'Market Hall', col: 32, row: 2, cols: 9, rows: 6, door: 'south' },
  { kind: 'cafe', label: 'Café', col: 4, row: 22, cols: 8, rows: 6, door: 'south' },
]

const FOUNTAIN: Rect = { col: 21, row: 15, cols: 2, rows: 2 }

const TREES: Cell[] = [
  [2, 10],
  [3, 13],
  [2, 19],
  [14, 3],
  [16, 6],
  [14, 9],
  [26, 3],
  [28, 7],
  [27, 10],
  [41, 11],
  [40, 13],
  [41, 19],
  [14, 22],
  [16, 26],
  [13, 27],
  [27, 23],
  [28, 28],
  [40, 29],
  [18, 27],
  [25, 29],
  [37, 10],
  [6, 11],
  [10, 19],
  [33, 20],
].map(([col, row]) => ({ col: col!, row: row! }))

const FLOWER_PATCHES: Rect[] = [
  { col: 13, row: 11, cols: 3, rows: 2 },
  { col: 28, row: 11, cols: 3, rows: 2 },
  { col: 13, row: 19, cols: 3, rows: 2 },
  { col: 28, row: 19, cols: 3, rows: 2 },
  { col: 2, row: 28, cols: 3, rows: 2 },
]

/**
 * On the plaza just south of the fountain: every plaza mentor is in view on arrival,
 * even at desktop zoom, and none is close enough to talk to yet.
 */
const PLAYER_SPAWN: Cell = { col: 21, row: 18 }

const MENTOR_SPAWNS: Cell[] = [
  { col: 18, row: 13 },
  { col: 25, row: 13 },
  { col: 18, row: 18 },
  { col: 25, row: 18 },
  { col: 8, row: 11 },
  { col: 35, row: 11 },
  { col: 8, row: 19 },
  { col: 35, row: 19 },
  // Further out: by the buildings, the pond and the lanes.
  { col: 12, row: 9 },
  { col: 30, row: 9 },
  { col: 14, row: 25 },
  { col: 26, row: 24 },
  { col: 39, row: 16 },
  { col: 3, row: 16 },
  { col: 19, row: 4 },
  { col: 39, row: 28 },
]

function fill(tiles: TileKind[][], rect: Rect, kind: TileKind): void {
  for (let row = rect.row; row < rect.row + rect.rows; row++) {
    for (let col = rect.col; col < rect.col + rect.cols; col++) {
      if (row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS) tiles[row]![col] = kind
    }
  }
}

/** Builds the map. Later shapes paint over earlier ones, so the order below matters. */
export function buildWorldMap(): WorldMap {
  const tiles: TileKind[][] = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, (): TileKind => TileKind.Grass),
  )

  for (const patch of FLOWER_PATCHES) fill(tiles, patch, TileKind.Flowers)

  // Main streets: east-west and north-south, crossing at the plaza.
  fill(tiles, { col: 1, row: 15, cols: MAP_COLS - 2, rows: 2 }, TileKind.Path)
  fill(tiles, { col: 21, row: 1, cols: 2, rows: MAP_ROWS - 2 }, TileKind.Path)
  // Side paths from each building's door to a street.
  fill(tiles, { col: 7, row: 8, cols: 2, rows: 7 }, TileKind.Path)
  fill(tiles, { col: 35, row: 8, cols: 2, rows: 7 }, TileKind.Path)
  // The cafe faces south: its path runs along the bottom of the square to the street.
  fill(tiles, { col: 7, row: 28, cols: 2, rows: 2 }, TileKind.Path)
  fill(tiles, { col: 9, row: 29, cols: 12, rows: 1 }, TileKind.Path)

  fill(tiles, { col: 16, row: 11, cols: 12, rows: 10 }, TileKind.Plaza)
  fill(tiles, FOUNTAIN, TileKind.Fountain)
  for (const col of [17, 26]) {
    tiles[12]![col] = TileKind.Bench
    tiles[19]![col] = TileKind.Bench
  }
  for (const [col, row] of [
    [16, 11],
    [27, 11],
    [16, 20],
    [27, 20],
    [20, 6],
    [23, 24],
    [9, 14],
    [34, 14],
  ] as const) {
    tiles[row]![col] = TileKind.Lamp
  }

  fill(tiles, { col: 30, row: 22, cols: 9, rows: 6 }, TileKind.Water)
  fill(tiles, { col: 29, row: 21, cols: 11, rows: 1 }, TileKind.Hedge)

  for (const building of BUILDINGS) fill(tiles, building, TileKind.Building)
  for (const tree of TREES) tiles[tree.row]![tree.col] = TileKind.Tree

  // A ring of forest keeps everyone inside the square.
  for (let col = 0; col < MAP_COLS; col++) {
    tiles[0]![col] = TileKind.Tree
    tiles[MAP_ROWS - 1]![col] = TileKind.Tree
  }
  for (let row = 0; row < MAP_ROWS; row++) {
    tiles[row]![0] = TileKind.Tree
    tiles[row]![MAP_COLS - 1] = TileKind.Tree
  }

  return {
    tiles,
    buildings: BUILDINGS,
    fountain: FOUNTAIN,
    playerSpawn: PLAYER_SPAWN,
    mentorSpawns: MENTOR_SPAWNS,
  }
}

export function tileAt(map: WorldMap, cell: Cell): TileKind | undefined {
  return map.tiles[cell.row]?.[cell.col]
}

export function isWalkable(map: WorldMap, cell: Cell): boolean {
  const kind = tileAt(map, cell)
  return kind !== undefined && !isBlocking(kind)
}

/** Every walkable cell reachable from `start` (4-neighbour flood fill), as "col,row" keys. */
export function reachableFrom(map: WorldMap, start: Cell): Set<string> {
  const key = (cell: Cell) => `${cell.col},${cell.row}`
  const seen = new Set<string>()
  if (!isWalkable(map, start)) return seen
  const queue: Cell[] = [start]
  seen.add(key(start))
  while (queue.length) {
    const cell = queue.shift()!
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next = { col: cell.col + dc, row: cell.row + dr }
      if (!seen.has(key(next)) && isWalkable(map, next)) {
        seen.add(key(next))
        queue.push(next)
      }
    }
  }
  return seen
}

/** The cell just outside a building's door (the doorway is two tiles wide, centred). */
export function doorstep(building: Building): Cell {
  return {
    col: building.col + Math.floor(building.cols / 2) - 1,
    row: building.row + building.rows,
  }
}

const GROUND: ReadonlySet<TileKind> = new Set<TileKind>([
  TileKind.Grass,
  TileKind.Flowers,
  TileKind.Path,
  TileKind.Plaza,
  TileKind.Water,
])

export function isGround(kind: TileKind): boolean {
  return GROUND.has(kind)
}

/**
 * What to draw under an object tile (tree, bench, lamp...): the most common plain
 * ground among its neighbours, so a bench on the plaza sits on stone and a tree in
 * a field on grass. Ground tiles are their own ground.
 */
export function groundUnder(map: WorldMap, cell: Cell): TileKind {
  const own = tileAt(map, cell)
  if (own !== undefined && isGround(own)) return own
  const counts = new Map<TileKind, number>()
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const kind = tileAt(map, { col: cell.col + dc, row: cell.row + dr })
    if (kind === TileKind.Grass || kind === TileKind.Path || kind === TileKind.Plaza) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
    }
  }
  let best: TileKind = TileKind.Grass
  let bestCount = 0
  for (const [kind, count] of counts) {
    if (count > bestCount) {
      best = kind
      bestCount = count
    }
  }
  return best
}

/** The pixel centre of a cell. */
export function cellCenter(cell: Cell): { x: number; y: number } {
  return { x: cell.col * TILE + TILE / 2, y: cell.row * TILE + TILE / 2 }
}

/**
 * Where `count` mentors start. The hand-placed spots come first; beyond them the
 * square still grows: further spots are picked from reachable ground (grass,
 * path, plaza), at least three tiles from other spots where possible. The same
 * count always gives the same spots, so a mentor keeps their place across visits.
 */
export function mentorSpawnSpots(map: WorldMap, count: number): Cell[] {
  const spots = map.mentorSpawns.slice(0, count)
  if (spots.length >= count) return spots

  const reachable = reachableFrom(map, map.playerSpawn)
  const taken = new Set([...spots, map.playerSpawn].map((cell) => `${cell.col},${cell.row}`))
  const candidates: Cell[] = []
  for (const key of reachable) {
    if (taken.has(key)) continue
    const [col, row] = key.split(',').map(Number) as [number, number]
    candidates.push({ col, row })
  }
  // A fixed shuffle (seeded), so the spots are spread out but stable.
  let seed = 0x9e3779b1
  const random = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0
    return seed / 4294967296
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!]
  }

  const farEnough = (cell: Cell, minTiles: number) =>
    [...spots, map.playerSpawn].every(
      (other) => Math.hypot(other.col - cell.col, other.row - cell.row) >= minTiles,
    )
  for (const minTiles of [3, 2, 0]) {
    for (const cell of candidates) {
      if (spots.length >= count) return spots
      if (!taken.has(`${cell.col},${cell.row}`) && farEnough(cell, minTiles)) {
        spots.push(cell)
        taken.add(`${cell.col},${cell.row}`)
      }
    }
  }
  return spots
}
