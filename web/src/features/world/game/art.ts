/**
 * All of Mentor Square's art, drawn with the Canvas 2D API at start-up: no image
 * files, nothing to license. Chunky pixel style: every shape is whole-pixel rects.
 * Deterministic (seeded), so the town looks the same on every load.
 */
import type { Appearance } from './appearance'
import { TILE, TILE_KIND_COUNT, TileKind, type Building } from './map'
import { seededRng, type Rng } from './wander'

/** Character frames: 4 facings x 3 frames (stand, step, other step). */
export const CHARACTER_W = 32
export const CHARACTER_H = 48
export const FACINGS = ['down', 'left', 'right', 'up'] as const
export const WALK_FRAMES = 3

type Ctx = CanvasRenderingContext2D

function canvas(width: number, height: number): [HTMLCanvasElement, Ctx] {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  const ctx = element.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  ctx.imageSmoothingEnabled = false
  return [element, ctx]
}

function rect(ctx: Ctx, colour: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = colour
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

/** A filled circle made of rects, so it stays crisp when the camera zooms. */
function disc(ctx: Ctx, colour: string, cx: number, cy: number, r: number): void {
  ctx.fillStyle = colour
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy))
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1)
  }
}

function speckle(ctx: Ctx, rng: Rng, colours: string[], count: number, ox: number): void {
  for (let i = 0; i < count; i++) {
    rect(ctx, colours[i % colours.length]!, ox + rng() * (TILE - 2), rng() * (TILE - 2), 2, 2)
  }
}

// --- Tiles --------------------------------------------------------------------

const GRASS = '#7fb65b'

function drawGrass(ctx: Ctx, ox: number, rng: Rng): void {
  rect(ctx, GRASS, ox, 0, TILE, TILE)
  speckle(ctx, rng, ['#6fa64e', '#8cc267', '#6a9e49'], 10, ox)
}

function drawTile(ctx: Ctx, kind: TileKind, ox: number, rng: Rng): void {
  switch (kind) {
    case TileKind.Grass:
      drawGrass(ctx, ox, rng)
      return
    case TileKind.Flowers: {
      drawGrass(ctx, ox, rng)
      const petals = ['#f4a6c0', '#ffe066', '#f6f1e9', '#c39bd3']
      for (let i = 0; i < 6; i++) {
        const x = ox + 3 + rng() * 24
        const y = 3 + rng() * 24
        rect(ctx, petals[i % petals.length]!, x, y, 3, 3)
        rect(ctx, '#e9a23b', x + 1, y + 1, 1, 1)
      }
      return
    }
    case TileKind.Path:
      rect(ctx, '#dcc79b', ox, 0, TILE, TILE)
      speckle(ctx, rng, ['#c9b285', '#e8d6ae', '#bfa677'], 9, ox)
      return
    case TileKind.Plaza:
      rect(ctx, '#d4ccbd', ox, 0, TILE, TILE)
      rect(ctx, '#bdb3a2', ox, 15, TILE, 2)
      rect(ctx, '#bdb3a2', ox + 15, 0, 2, 15)
      rect(ctx, '#bdb3a2', ox + 7, 17, 2, 15)
      rect(ctx, '#e2dbcd', ox + 2, 2, 4, 2)
      rect(ctx, '#e2dbcd', ox + 19, 19, 4, 2)
      return
    case TileKind.Water:
      rect(ctx, '#4f97c2', ox, 0, TILE, TILE)
      for (let i = 0; i < 3; i++) {
        const y = 5 + i * 10 + Math.floor(rng() * 3)
        rect(ctx, '#7cb8db', ox + 4 + rng() * 14, y, 8, 2)
      }
      return
    case TileKind.Tree:
      rect(ctx, '#00000030', ox + 7, 25, 20, 5)
      rect(ctx, '#7a5233', ox + 13, 18, 6, 10)
      disc(ctx, '#3f7d3a', ox + 16, 13, 12)
      disc(ctx, '#4f9446', ox + 14, 11, 9)
      disc(ctx, '#67ad59', ox + 12, 8, 4)
      return
    case TileKind.Hedge:
      rect(ctx, '#3f7d3a', ox + 1, 6, 30, 22)
      rect(ctx, '#4f9446', ox + 1, 6, 30, 6)
      speckle(ctx, rng, ['#67ad59', '#356b31'], 8, ox)
      return
    case TileKind.Bench:
      rect(ctx, '#00000026', ox + 3, 24, 26, 4)
      rect(ctx, '#8a5a35', ox + 3, 10, 26, 4)
      rect(ctx, '#a06c41', ox + 3, 16, 26, 6)
      rect(ctx, '#4a4a4a', ox + 5, 22, 3, 5)
      rect(ctx, '#4a4a4a', ox + 24, 22, 3, 5)
      return
    case TileKind.Lamp:
      rect(ctx, '#00000026', ox + 10, 27, 12, 3)
      rect(ctx, '#3d3d46', ox + 14, 8, 4, 20)
      rect(ctx, '#3d3d46', ox + 11, 26, 10, 3)
      rect(ctx, '#3d3d46', ox + 10, 3, 12, 7)
      rect(ctx, '#ffe9a8', ox + 12, 4, 8, 5)
      return
    case TileKind.Building:
    case TileKind.Fountain:
      // Solid but invisible: the building and fountain images are drawn on top.
      return
  }
}

/** One row of tiles, in TileKind order; object tiles have a transparent background. */
export function drawTileset(): HTMLCanvasElement {
  const [element, ctx] = canvas(TILE * TILE_KIND_COUNT, TILE)
  const rng = seededRng(2024)
  for (let kind = 0; kind < TILE_KIND_COUNT; kind++) {
    drawTile(ctx, kind as TileKind, kind * TILE, rng)
  }
  return element
}

// --- Characters ------------------------------------------------------------------

function drawCharacter(
  ctx: Ctx,
  look: Appearance,
  facing: (typeof FACINGS)[number],
  frame: number,
  ox: number,
  oy: number,
): void {
  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1
  const bob = frame === 0 ? 0 : 1
  const x = ox
  const y = oy + bob

  rect(ctx, '#00000033', x + 7, oy + 42, 18, 4)

  // Legs and shoes, swinging opposite each other.
  const leftLeg = facing === 'left' || facing === 'right' ? step * 2 : step
  rect(ctx, look.trousers, x + 11, y + 31 + Math.max(0, leftLeg), 4, 9 - Math.abs(leftLeg))
  rect(ctx, look.trousers, x + 17, y + 31 + Math.max(0, -leftLeg), 4, 9 - Math.abs(leftLeg))
  rect(ctx, '#2b2b2b', x + 10 + (facing === 'left' ? -1 : 0), y + 39, 5, 2)
  rect(ctx, '#2b2b2b', x + 17 + (facing === 'right' ? 1 : 0), y + 39, 5, 2)

  // Body and arms.
  rect(ctx, look.outfit, x + 9, y + 19, 14, 13)
  rect(ctx, look.trim, x + 9, y + 30, 14, 2)
  const armSwing = step * 2
  if (facing !== 'right') rect(ctx, look.outfit, x + 6, y + 20 + armSwing, 3, 10)
  if (facing !== 'left') rect(ctx, look.outfit, x + 23, y + 20 - armSwing, 3, 10)
  if (facing !== 'right') rect(ctx, look.skin, x + 6, y + 30 + armSwing, 3, 2)
  if (facing !== 'left') rect(ctx, look.skin, x + 23, y + 30 - armSwing, 3, 2)

  if (facing === 'down') {
    rect(ctx, look.trim, x + 13, y + 19, 6, 2)
    if (look.accessory === 'tie') {
      rect(ctx, '#b23a48', x + 15, y + 21, 2, 7)
    }
  }
  if (look.accessory === 'scarf') rect(ctx, '#d1495b', x + 9, y + 18, 14, 3)

  // Head.
  rect(ctx, look.skin, x + 9, y + 5, 14, 13)
  if (facing === 'down') {
    rect(ctx, '#2b2118', x + 12, y + 11, 2, 2)
    rect(ctx, '#2b2118', x + 18, y + 11, 2, 2)
    rect(ctx, '#c97b63', x + 14, y + 15, 4, 1)
    if (look.accessory === 'glasses') {
      rect(ctx, '#222222', x + 11, y + 10, 4, 1)
      rect(ctx, '#222222', x + 17, y + 10, 4, 1)
      rect(ctx, '#222222', x + 15, y + 10, 2, 1)
    }
  } else if (facing === 'left' || facing === 'right') {
    const ex = facing === 'left' ? x + 11 : x + 19
    rect(ctx, '#2b2118', ex, y + 11, 2, 2)
    if (look.accessory === 'glasses') rect(ctx, '#222222', ex - 1, y + 10, 4, 1)
  }

  // Hair.
  const hair = look.hair
  switch (look.hairStyle) {
    case 'bald':
      rect(ctx, hair, x + 9, y + 9, 2, 5)
      rect(ctx, hair, x + 21, y + 9, 2, 5)
      if (facing === 'up') rect(ctx, hair, x + 9, y + 12, 14, 4)
      break
    case 'short':
      rect(ctx, hair, x + 9, y + 3, 14, 5)
      if (facing === 'up') rect(ctx, hair, x + 9, y + 3, 14, 12)
      break
    case 'long':
      rect(ctx, hair, x + 8, y + 3, 16, 5)
      rect(ctx, hair, x + 8, y + 7, 3, 12)
      rect(ctx, hair, x + 21, y + 7, 3, 12)
      if (facing === 'up') rect(ctx, hair, x + 8, y + 3, 16, 16)
      break
    case 'side':
      rect(ctx, hair, x + 9, y + 3, 14, 4)
      rect(ctx, hair, facing === 'right' ? x + 9 : x + 15, y + 5, 8, 3)
      if (facing === 'up') rect(ctx, hair, x + 9, y + 3, 14, 12)
      break
    case 'bun':
      rect(ctx, hair, x + 9, y + 3, 14, 5)
      rect(ctx, hair, x + 13, y, 6, 4)
      if (facing === 'up') rect(ctx, hair, x + 9, y + 3, 14, 12)
      break
  }

  if (look.accessory === 'hat') {
    rect(ctx, '#3a3a52', x + 6, y + 6, 20, 2)
    rect(ctx, '#3a3a52', x + 10, y, 12, 6)
    rect(ctx, look.trim, x + 10, y + 4, 12, 2)
  }
}

/** A sheet of FACINGS.length x WALK_FRAMES frames, row per facing. */
export function drawCharacterSheet(look: Appearance): HTMLCanvasElement {
  const [element, ctx] = canvas(CHARACTER_W * WALK_FRAMES, CHARACTER_H * FACINGS.length)
  FACINGS.forEach((facing, row) => {
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      drawCharacter(ctx, look, facing, frame, frame * CHARACTER_W, row * CHARACTER_H)
    }
  })
  return element
}

/** The frame index of `facing` at `frame` in a character sheet. */
export function characterFrame(facing: (typeof FACINGS)[number], frame: number): number {
  return FACINGS.indexOf(facing) * WALK_FRAMES + frame
}

// --- Buildings and the fountain -------------------------------------------------

interface BuildingStyle {
  wall: string
  wallShade: string
  roof: string
  roofShade: string
  trim: string
}

const BUILDING_STYLES: Record<Building['kind'], BuildingStyle> = {
  library: {
    wall: '#e3d5b8',
    wallShade: '#c9b994',
    roof: '#3f5f8a',
    roofShade: '#33507a',
    trim: '#f4ecd8',
  },
  market: {
    wall: '#b9644a',
    wallShade: '#9c513b',
    roof: '#c0392b',
    roofShade: '#f2e8d5',
    trim: '#f2e8d5',
  },
  cafe: {
    wall: '#f1e3c6',
    wallShade: '#dcc9a3',
    roof: '#3b7d5c',
    roofShade: '#2f6a4d',
    trim: '#e9c46a',
  },
}

export function drawBuilding(building: Building): HTMLCanvasElement {
  const width = building.cols * TILE
  const height = building.rows * TILE
  const [element, ctx] = canvas(width, height)
  const style = BUILDING_STYLES[building.kind]
  const roofHeight = Math.round(height * 0.5)
  const wallTop = roofHeight - 4

  // Wall, with a darker plinth.
  rect(ctx, style.wall, 4, wallTop, width - 8, height - wallTop - 2)
  rect(ctx, style.wallShade, 4, height - 10, width - 8, 8)

  // Roof: market gets a striped awning, the others shingles.
  for (let y = 0; y < roofHeight; y += 6) {
    const stripe = building.kind === 'market' ? (y / 6) % 2 === 0 : (y / 6) % 2 === 0
    rect(ctx, stripe ? style.roof : style.roofShade, 0, y, width, 6)
  }
  if (building.kind !== 'market') {
    for (let y = 3; y < roofHeight; y += 6) {
      for (let x = (y / 3) % 2 === 0 ? 0 : 8; x < width; x += 16) {
        rect(ctx, '#00000018', x, y, 2, 3)
      }
    }
  }
  rect(ctx, '#00000030', 0, roofHeight - 4, width, 4)

  // Windows either side of the door.
  const windowY = wallTop + 14
  const doorWidth = TILE * 2 - 16
  const doorX = Math.floor(building.cols / 2) * TILE - TILE + 8
  for (let x = 16; x + 22 < width - 12; x += 40) {
    if (x + 22 > doorX - 6 && x < doorX + doorWidth + 6) continue
    rect(ctx, style.trim, x - 2, windowY - 2, 26, 22)
    rect(ctx, '#7fb3d5', x, windowY, 22, 18)
    rect(ctx, '#a9d0ea', x + 2, windowY + 2, 6, 6)
    rect(ctx, style.trim, x + 10, windowY, 2, 18)
  }

  // Door, centred on the doorstep the path leads to.
  rect(ctx, style.trim, doorX - 3, height - 44, doorWidth + 6, 42)
  rect(ctx, '#6b4428', doorX, height - 41, doorWidth, 39)
  rect(ctx, '#e9c46a', doorX + doorWidth - 8, height - 22, 3, 3)

  // Sign over the door.
  ctx.font = 'bold 12px ui-monospace, Menlo, monospace'
  const textWidth = Math.ceil(ctx.measureText(building.label).width)
  const signWidth = textWidth + 14
  const signX = Math.round(width / 2 - signWidth / 2)
  const signY = wallTop + 2
  rect(ctx, '#5a3a22', signX, signY, signWidth, 16)
  rect(ctx, '#f4ecd8', signX + 2, signY + 2, signWidth - 4, 12)
  ctx.fillStyle = '#3a2a1a'
  ctx.textBaseline = 'middle'
  ctx.fillText(building.label, signX + 7, signY + 8.5)

  return element
}

export function drawFountain(): HTMLCanvasElement {
  const size = TILE * 2
  const [element, ctx] = canvas(size, size)
  disc(ctx, '#00000022', 32, 36, 30)
  disc(ctx, '#a9a294', 32, 32, 30)
  disc(ctx, '#c9c2b4', 32, 32, 26)
  disc(ctx, '#4f97c2', 32, 32, 22)
  disc(ctx, '#7cb8db', 28, 28, 8)
  disc(ctx, '#bdb3a2', 32, 32, 6)
  disc(ctx, '#e8f4fb', 32, 26, 3)
  return element
}
