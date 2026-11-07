/**
 * All of Mentor Square's art, drawn with the Canvas 2D API at start-up: no image
 * files, nothing to license. Deterministic (seeded), so the town looks the same on
 * every load.
 *
 * Drawn at ART_SCALE times the world's resolution (a 32px tile is a 64px drawing)
 * and shown at 1 / ART_SCALE, so at the usual desktop zoom every texture pixel is a
 * screen pixel. Main shapes snap to a 2px grid and outlines are 2px wide, so they
 * survive the smaller zoom on phones; 1px details add texture up close.
 */
import type { Appearance } from './appearance'
import { TILE, TILE_KIND_COUNT, TileKind, type Building } from './map'
import { seededRng, type Rng } from './wander'

/** Texture pixels per world pixel. */
export const ART_SCALE = 2
/** One tile, in texture pixels. */
const T = TILE * ART_SCALE

/** Character frames, in world pixels (the textures are ART_SCALE times larger). */
export const CHARACTER_W = 32
export const CHARACTER_H = 48
const CW = CHARACTER_W * ART_SCALE
const CH = CHARACTER_H * ART_SCALE
export const FACINGS = ['down', 'left', 'right', 'up'] as const
export const WALK_FRAMES = 3

type Ctx = CanvasRenderingContext2D
type Facing = (typeof FACINGS)[number]

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

/** A filled ellipse made of rects, so edges stay crisp at any zoom. */
function ellipse(ctx: Ctx, colour: string, cx: number, cy: number, rx: number, ry: number): void {
  ctx.fillStyle = colour
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))))
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1)
  }
}

function disc(ctx: Ctx, colour: string, cx: number, cy: number, r: number): void {
  ellipse(ctx, colour, cx, cy, r, r)
}

/** A rect with a 2px outline around it (drawn back to front, like sprite art). */
function block(
  ctx: Ctx,
  fill: string,
  outline: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  rect(ctx, outline, x - 2, y - 2, w + 4, h + 4)
  rect(ctx, fill, x, y, w, h)
}

/** Darken (amount < 0) or lighten (> 0) a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (shift: number) => {
    const value = (n >> shift) & 0xff
    const target = amount < 0 ? 0 : 255
    return Math.round(value + (target - value) * Math.abs(amount))
  }
  const out = (channel(16) << 16) | (channel(8) << 8) | channel(0)
  return `#${out.toString(16).padStart(6, '0')}`
}

// --- Tiles (64 x 64) -----------------------------------------------------------------

const GRASS = '#7fb65b'

function drawGrass(ctx: Ctx, ox: number, rng: Rng): void {
  rect(ctx, GRASS, ox, 0, T, T)
  // Soft patches, then blades: a short dark stroke with a light tip.
  for (let i = 0; i < 4; i++) {
    ellipse(ctx, '#78ad55', ox + 8 + rng() * 48, 8 + rng() * 48, 6 + rng() * 6, 3 + rng() * 3)
  }
  for (let i = 0; i < 26; i++) {
    const x = ox + 2 + Math.floor(rng() * 30) * 2
    const y = 2 + Math.floor(rng() * 28) * 2
    rect(ctx, '#5f9445', x, y + 2, 2, 4)
    rect(ctx, '#9acb72', x, y, 2, 2)
  }
}

function drawPath(ctx: Ctx, ox: number, rng: Rng): void {
  rect(ctx, '#dcc79b', ox, 0, T, T)
  for (let i = 0; i < 18; i++) rect(ctx, '#d2bc8e', ox + rng() * 60, rng() * 60, 4, 2)
  // Pebbles with a lit top and a shadow below.
  for (let i = 0; i < 7; i++) {
    const x = ox + 4 + Math.floor(rng() * 26) * 2
    const y = 4 + Math.floor(rng() * 26) * 2
    const w = 4 + Math.floor(rng() * 3) * 2
    rect(ctx, '#b49c6e', x, y + 2, w, 2)
    rect(ctx, '#c9b285', x, y, w, 2)
    rect(ctx, '#ecdcb7', x, y, 2, 2)
  }
}

function drawPlaza(ctx: Ctx, ox: number, rng: Rng): void {
  // Four bevelled slabs per tile, offset per row like real paving.
  const slab = (x: number, y: number, w: number, h: number) => {
    rect(ctx, '#bdb3a2', x, y, w, h) // mortar
    rect(ctx, '#d6cebf', x + 2, y + 2, w - 4, h - 4)
    rect(ctx, '#e5dfd3', x + 2, y + 2, w - 4, 2) // lit top edge
    rect(ctx, '#e5dfd3', x + 2, y + 2, 2, h - 4) // lit left edge
    rect(ctx, '#c4b9a6', x + 2, y + h - 4, w - 4, 2) // shaded bottom edge
    for (let i = 0; i < 3; i++) {
      rect(ctx, '#cbc2b2', x + 6 + rng() * (w - 12), y + 6 + rng() * (h - 12), 2, 2)
    }
  }
  slab(ox, 0, 32, 32)
  slab(ox + 32, 0, 32, 32)
  slab(ox, 32, 20, 32)
  slab(ox + 20, 32, 44, 32)
}

function drawWater(ctx: Ctx, ox: number, rng: Rng): void {
  rect(ctx, '#4b92be', ox, 0, T, T)
  for (let y = 0; y < T; y += 16) rect(ctx, '#4789b4', ox, y + 8, T, 4)
  for (let i = 0; i < 5; i++) {
    const x = ox + 4 + rng() * 44
    const y = 4 + Math.floor(rng() * 28) * 2
    rect(ctx, '#7cb8db', x, y, 12, 2)
    rect(ctx, '#a6d2ea', x + 4, y - 2, 4, 2)
  }
  if (rng() > 0.5) rect(ctx, '#e8f4fb', ox + 10 + rng() * 40, 10 + rng() * 40, 2, 2) // sparkle
}

function drawTree(ctx: Ctx, ox: number): void {
  ellipse(ctx, '#00000030', ox + 32, 56, 24, 6)
  // Trunk with bark.
  block(ctx, '#7a5233', '#4a3120', ox + 26, 36, 12, 20)
  rect(ctx, '#8d6340', ox + 28, 36, 4, 20)
  rect(ctx, '#5f3f27', ox + 34, 42, 2, 8)
  // Canopy: dark outline, body, then light from the top left.
  disc(ctx, '#2f5f2c', ox + 32, 26, 26)
  disc(ctx, '#3f7d3a', ox + 32, 26, 23)
  disc(ctx, '#4f9446', ox + 28, 22, 17)
  disc(ctx, '#62a856', ox + 24, 17, 10)
  disc(ctx, '#7cc06a', ox + 21, 14, 4)
  // Leaf clusters break up the round edge.
  for (const [dx, dy] of [
    [-16, 12],
    [14, 14],
    [-6, 20],
    [18, 0],
  ] as const) {
    disc(ctx, '#356b31', ox + 32 + dx, 26 + dy, 5)
  }
}

function drawHedge(ctx: Ctx, ox: number, rng: Rng): void {
  ellipse(ctx, '#00000028', ox + 32, 58, 30, 4)
  rect(ctx, '#2f5f2c', ox, 8, T, 50)
  rect(ctx, '#3f7d3a', ox, 10, T, 46)
  rect(ctx, '#4f9446', ox, 10, T, 12)
  for (let i = 0; i < 16; i++) {
    const x = ox + Math.floor(rng() * 30) * 2
    const y = 14 + Math.floor(rng() * 18) * 2
    rect(ctx, i % 2 ? '#62a856' : '#356b31', x, y, 4, 2)
  }
}

function drawBench(ctx: Ctx, ox: number): void {
  ellipse(ctx, '#00000030', ox + 32, 54, 26, 5)
  // Legs, then the backrest and seat slats with grain and a lit edge.
  block(ctx, '#3d3d46', '#26262c', ox + 10, 40, 4, 12)
  block(ctx, '#3d3d46', '#26262c', ox + 50, 40, 4, 12)
  for (const y of [18, 26]) {
    block(ctx, '#8a5a35', '#4a2f1b', ox + 6, y, 52, 4)
    rect(ctx, '#a06c41', ox + 6, y, 52, 2)
  }
  block(ctx, '#a06c41', '#4a2f1b', ox + 4, 36, 56, 6)
  rect(ctx, '#bb8455', ox + 4, 36, 56, 2)
  for (const x of [16, 30, 44]) rect(ctx, '#8a5a35', ox + x, 38, 6, 2)
}

function drawLamp(ctx: Ctx, ox: number): void {
  // A soft glow first, so the lantern sits in its own light.
  ellipse(ctx, '#ffe9a822', ox + 32, 14, 22, 18)
  ellipse(ctx, '#00000030', ox + 32, 58, 12, 3)
  block(ctx, '#3d3d46', '#24242a', ox + 22, 52, 20, 4)
  block(ctx, '#3d3d46', '#24242a', ox + 29, 18, 6, 34)
  rect(ctx, '#5a5a66', ox + 29, 18, 2, 34)
  block(ctx, '#3d3d46', '#24242a', ox + 20, 4, 24, 14)
  rect(ctx, '#ffe9a8', ox + 24, 8, 16, 8)
  rect(ctx, '#fff7d6', ox + 26, 8, 4, 4)
  rect(ctx, '#24242a', ox + 18, 2, 28, 2) // cap
}

function drawTile(ctx: Ctx, kind: TileKind, ox: number, rng: Rng): void {
  switch (kind) {
    case TileKind.Grass:
      drawGrass(ctx, ox, rng)
      return
    case TileKind.Flowers: {
      drawGrass(ctx, ox, rng)
      const petals = ['#f4a6c0', '#ffe066', '#f6f1e9', '#c39bd3']
      for (let i = 0; i < 5; i++) {
        const x = ox + 8 + Math.floor(rng() * 22) * 2
        const y = 8 + Math.floor(rng() * 22) * 2
        const colour = petals[i % petals.length]!
        rect(ctx, '#4f8a3a', x + 2, y + 4, 2, 6) // stem
        for (const [dx, dy] of [
          [-2, 0],
          [2, 0],
          [0, -2],
          [0, 2],
        ] as const) {
          rect(ctx, colour, x + dx, y + dy, 2, 2)
        }
        rect(ctx, '#e9a23b', x, y, 2, 2)
      }
      return
    }
    case TileKind.Path:
      drawPath(ctx, ox, rng)
      return
    case TileKind.Plaza:
      drawPlaza(ctx, ox, rng)
      return
    case TileKind.Water:
      drawWater(ctx, ox, rng)
      return
    case TileKind.Tree:
      drawTree(ctx, ox)
      return
    case TileKind.Hedge:
      drawHedge(ctx, ox, rng)
      return
    case TileKind.Bench:
      drawBench(ctx, ox)
      return
    case TileKind.Lamp:
      drawLamp(ctx, ox)
      return
    case TileKind.Building:
    case TileKind.Fountain:
      // Solid but invisible: the building and fountain images are drawn on top.
      return
  }
}

/** One row of 64px tiles, in TileKind order; object tiles have a transparent background. */
export function drawTileset(): HTMLCanvasElement {
  const [element, ctx] = canvas(T * TILE_KIND_COUNT, T)
  const rng = seededRng(2024)
  for (let kind = 0; kind < TILE_KIND_COUNT; kind++) {
    drawTile(ctx, kind as TileKind, kind * T, rng)
  }
  return element
}

/** The size, in texture pixels, of one tile in drawTileset(). */
export const TILESET_TILE = T

// --- Characters (64 x 96 frames) -------------------------------------------------------

function drawHair(ctx: Ctx, look: Appearance, facing: Facing, x: number, y: number): void {
  const hair = look.hair
  const dark = shade(hair, -0.35)
  const light = shade(hair, 0.3)
  const back = facing === 'up'
  switch (look.hairStyle) {
    case 'bald':
      block(ctx, hair, dark, x + 18, y + 18, 4, 10)
      block(ctx, hair, dark, x + 42, y + 18, 4, 10)
      if (back) block(ctx, hair, dark, x + 18, y + 22, 28, 10)
      rect(ctx, '#ffffff33', x + 26, y + 10, 8, 2) // shine on the scalp
      return
    case 'short':
      block(ctx, hair, dark, x + 18, y + 6, 28, back ? 24 : 10)
      if (facing === 'left') rect(ctx, hair, x + 18, y + 14, 4, 8)
      if (facing === 'right') rect(ctx, hair, x + 42, y + 14, 4, 8)
      rect(ctx, light, x + 22, y + 8, 12, 2)
      return
    case 'long':
      block(ctx, hair, dark, x + 16, y + 6, 32, 10)
      block(ctx, hair, dark, x + 16, y + 14, 6, 24)
      block(ctx, hair, dark, x + 42, y + 14, 6, 24)
      if (back) block(ctx, hair, dark, x + 16, y + 6, 32, 32)
      rect(ctx, light, x + 22, y + 8, 14, 2)
      return
    case 'side':
      block(ctx, hair, dark, x + 18, y + 6, 28, back ? 24 : 8)
      if (!back) block(ctx, hair, dark, facing === 'right' ? x + 18 : x + 30, y + 10, 16, 6)
      rect(ctx, light, x + 22, y + 8, 10, 2)
      return
    case 'bun':
      block(ctx, hair, dark, x + 26, y, 12, 8)
      block(ctx, hair, dark, x + 18, y + 6, 28, back ? 24 : 10)
      rect(ctx, light, x + 28, y + 2, 4, 2)
      return
  }
}

function drawFace(ctx: Ctx, look: Appearance, facing: Facing, x: number, y: number): void {
  if (facing === 'up') return
  const brow = shade(look.hair, -0.2)
  const eye = (ex: number) => {
    rect(ctx, '#ffffff', ex, y + 22, 4, 4)
    rect(ctx, '#2b2118', ex + (facing === 'left' ? 0 : 2), y + 22, 2, 4)
    rect(ctx, brow, ex, y + 18, 4, 2)
  }
  if (facing === 'down') {
    eye(x + 24)
    eye(x + 36)
    rect(ctx, shade(look.skin, -0.18), x + 30, y + 26, 4, 4) // nose
    rect(ctx, '#e8a0a0', x + 20, y + 28, 4, 2) // cheeks
    rect(ctx, '#e8a0a0', x + 40, y + 28, 4, 2)
    rect(ctx, '#a0524a', x + 28, y + 32, 8, 2) // mouth
    if (look.accessory === 'glasses') {
      ctx.strokeStyle = '#222222'
      ctx.lineWidth = 2
      ctx.strokeRect(x + 22, y + 20, 8, 8)
      ctx.strokeRect(x + 34, y + 20, 8, 8)
      rect(ctx, '#222222', x + 30, y + 22, 4, 2)
    }
  } else {
    const front = facing === 'left' ? x + 18 : x + 38
    eye(front + (facing === 'left' ? 4 : 0))
    rect(ctx, shade(look.skin, -0.18), facing === 'left' ? x + 16 : x + 44, y + 26, 4, 4)
    rect(ctx, '#a0524a', facing === 'left' ? x + 20 : x + 38, y + 32, 6, 2)
    if (look.accessory === 'glasses') {
      ctx.strokeStyle = '#222222'
      ctx.lineWidth = 2
      ctx.strokeRect(front + (facing === 'left' ? 2 : -2), y + 20, 8, 8)
    }
  }
}

function drawCharacter(
  ctx: Ctx,
  look: Appearance,
  facing: Facing,
  frame: number,
  ox: number,
  oy: number,
): void {
  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1
  const x = ox
  const y = oy + (frame === 0 ? 0 : 2) // a small bob while walking
  const skinDark = shade(look.skin, -0.3)
  const outfitDark = shade(look.outfit, -0.4)
  const outfitShade = shade(look.outfit, -0.15)
  const outfitLight = shade(look.outfit, 0.18)
  const trousersDark = shade(look.trousers, -0.4)

  ellipse(ctx, '#00000038', ox + 32, oy + 88, 18, 4)

  // Legs and shoes, swinging opposite each other (more in profile).
  const swing = facing === 'left' || facing === 'right' ? step * 4 : step * 2
  const leg = (lx: number, offset: number) => {
    const lift = Math.max(0, offset)
    block(ctx, look.trousers, trousersDark, lx, y + 62 + lift, 8, 18 - Math.abs(offset))
    rect(ctx, shade(look.trousers, 0.15), lx, y + 62 + lift, 2, 18 - Math.abs(offset))
    block(ctx, '#2b2b2b', '#151515', lx - 2, y + 80, 12, 4)
    rect(ctx, '#55555f', lx, y + 80, 4, 2) // shoe shine
  }
  leg(x + 22, swing)
  leg(x + 34, -swing)

  // Arms behind the body when walking away or in profile.
  const arm = (ax: number, offset: number) => {
    block(ctx, look.outfit, outfitDark, ax, y + 40 + offset, 6, 20)
    block(ctx, look.skin, skinDark, ax, y + 60 + offset, 6, 4)
  }
  if (facing === 'up') {
    arm(x + 12, step * 3)
    arm(x + 46, -step * 3)
  }

  // Torso: outline, body, side shading, lit edge, hem.
  block(ctx, look.outfit, outfitDark, x + 18, y + 38, 28, 26)
  rect(ctx, outfitShade, x + 38, y + 40, 8, 24)
  rect(ctx, outfitLight, x + 18, y + 38, 4, 24)
  rect(ctx, look.trim, x + 18, y + 60, 28, 4)

  if (facing === 'down') {
    rect(ctx, look.trim, x + 26, y + 38, 12, 4) // collar
    if (look.accessory === 'tie') {
      rect(ctx, '#b23a48', x + 30, y + 42, 4, 14)
      rect(ctx, '#d2525f', x + 30, y + 42, 2, 4)
    } else {
      rect(ctx, outfitDark, x + 31, y + 44, 2, 2) // buttons
      rect(ctx, outfitDark, x + 31, y + 50, 2, 2)
    }
  }
  if (look.accessory === 'scarf') {
    block(ctx, '#d1495b', '#8f2a38', x + 18, y + 36, 28, 6)
    if (facing === 'down') rect(ctx, '#d1495b', x + 38, y + 42, 6, 10)
  }

  if (facing !== 'up') {
    if (facing !== 'right') arm(x + 12, step * 3)
    if (facing !== 'left') arm(x + 46, -step * 3)
  }

  // Head: outline, face, a lit cheek on the left, ears.
  if (facing !== 'up') {
    block(ctx, look.skin, skinDark, x + 14, y + 22, 4, 8) // ear
    block(ctx, look.skin, skinDark, x + 46, y + 22, 4, 8)
  }
  block(ctx, look.skin, skinDark, x + 18, y + 10, 28, 28)
  rect(ctx, shade(look.skin, 0.12), x + 18, y + 10, 4, 24)
  rect(ctx, shade(look.skin, -0.1), x + 18, y + 34, 28, 4) // chin shadow

  drawFace(ctx, look, facing, x, y)
  drawHair(ctx, look, facing, x, y)

  if (look.accessory === 'hat') {
    block(ctx, '#3a3a52', '#20202e', x + 12, y + 12, 40, 4) // brim
    block(ctx, '#3a3a52', '#20202e', x + 20, y, 24, 12)
    rect(ctx, look.trim, x + 20, y + 8, 24, 4) // band
    rect(ctx, '#54547a', x + 22, y + 2, 4, 6) // highlight
  }
}

/** A sheet of FACINGS.length x WALK_FRAMES frames (64 x 96 each), a row per facing. */
export function drawCharacterSheet(look: Appearance): HTMLCanvasElement {
  const [element, ctx] = canvas(CW * WALK_FRAMES, CH * FACINGS.length)
  FACINGS.forEach((facing, row) => {
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      drawCharacter(ctx, look, facing, frame, frame * CW, row * CH)
    }
  })
  return element
}

/** The frame index of `facing` at `frame` in a character sheet. */
export function characterFrame(facing: Facing, frame: number): number {
  return FACINGS.indexOf(facing) * WALK_FRAMES + frame
}

/** Frame size in texture pixels (for cutting the sheet). */
export const CHARACTER_TEXTURE = { width: CW, height: CH } as const

// --- Buildings and the fountain --------------------------------------------------------

interface BuildingStyle {
  wall: string
  roof: string
  trim: string
  door: string
}

const BUILDING_STYLES: Record<Building['kind'], BuildingStyle> = {
  library: { wall: '#e3d5b8', roof: '#3f5f8a', trim: '#f4ecd8', door: '#6b4428' },
  market: { wall: '#b9644a', roof: '#c0392b', trim: '#f2e8d5', door: '#5a3a22' },
  cafe: { wall: '#f1e3c6', roof: '#3b7d5c', trim: '#e9c46a', door: '#7a4a2a' },
}

function wallTexture(
  ctx: Ctx,
  building: Building,
  style: BuildingStyle,
  top: number,
  width: number,
  height: number,
): void {
  const mortar = shade(style.wall, -0.18)
  if (building.kind === 'market') {
    // Bricks, every other row offset.
    for (let row = 0, y = top; y < height; row++, y += 12) {
      rect(ctx, mortar, 8, y + 10, width - 16, 2)
      for (let x = 8 + (row % 2 ? 12 : 0); x < width - 8; x += 24) rect(ctx, mortar, x, y, 2, 10)
      for (let x = 10 + (row % 2 ? 12 : 0); x < width - 12; x += 24) {
        rect(ctx, shade(style.wall, 0.08), x, y, 10, 2)
      }
    }
  } else if (building.kind === 'library') {
    // Large dressed stone blocks and columns either side of the door.
    for (let row = 0, y = top; y < height; row++, y += 20) {
      rect(ctx, mortar, 8, y + 18, width - 16, 2)
      for (let x = 8 + (row % 2 ? 24 : 0); x < width - 8; x += 48) rect(ctx, mortar, x, y, 2, 18)
    }
  } else {
    // Plaster with timber framing.
    const timber = '#6b4a2e'
    rect(ctx, timber, 8, top, width - 16, 4)
    for (let x = 8; x < width - 8; x += 64) rect(ctx, timber, x, top, 4, height - top)
    rect(ctx, timber, width - 12, top, 4, height - top)
  }
}

function windowAt(ctx: Ctx, style: BuildingStyle, x: number, y: number, cafe: boolean): void {
  block(ctx, style.trim, shade(style.trim, -0.4), x - 4, y - 4, 52, 44)
  rect(ctx, '#5c8fb3', x, y, 44, 36)
  rect(ctx, '#7fb3d5', x, y, 44, 16)
  rect(ctx, '#bfe0f2', x + 4, y + 4, 10, 4) // reflection
  rect(ctx, '#bfe0f2', x + 4, y + 8, 4, 4)
  rect(ctx, style.trim, x + 20, y, 4, 36) // mullion
  rect(ctx, style.trim, x, y + 16, 44, 4) // transom
  block(ctx, shade(style.trim, -0.15), shade(style.trim, -0.45), x - 6, y + 38, 56, 4) // sill
  if (cafe) {
    block(ctx, '#3b7d5c', '#24503a', x - 16, y - 2, 8, 40) // shutters
    block(ctx, '#3b7d5c', '#24503a', x + 52, y - 2, 8, 40)
    rect(ctx, '#c0392b', x + 4, y + 30, 8, 4) // flowers on the sill
    rect(ctx, '#ffe066', x + 16, y + 30, 6, 4)
  }
}

export function drawBuilding(building: Building): HTMLCanvasElement {
  const width = building.cols * T
  const height = building.rows * T
  const [element, ctx] = canvas(width, height)
  const style = BUILDING_STYLES[building.kind]
  const roofHeight = Math.round(height * 0.48)
  const wallTop = roofHeight - 8

  // Shadow on the ground, then the wall with a darker plinth.
  rect(ctx, '#00000030', 12, height - 8, width - 16, 8)
  block(ctx, style.wall, shade(style.wall, -0.45), 10, wallTop, width - 20, height - wallTop - 12)
  wallTexture(ctx, building, style, wallTop + 4, width, height - 12)
  rect(ctx, shade(style.wall, -0.2), 10, height - 28, width - 20, 16)

  // Roof: shingle rows (shaded, staggered) or, for the market, a striped awning.
  rect(ctx, shade(style.roof, -0.5), 0, 0, width, roofHeight + 2)
  for (let row = 0, y = 2; y < roofHeight; row++, y += 12) {
    if (building.kind === 'market') {
      rect(ctx, row % 2 ? '#f2e8d5' : style.roof, 2, y, width - 4, 12)
      continue
    }
    rect(ctx, row % 2 ? shade(style.roof, -0.1) : style.roof, 2, y, width - 4, 12)
    for (let x = 2 + (row % 2 ? 12 : 0); x < width; x += 24) {
      rect(ctx, shade(style.roof, -0.3), x, y, 2, 12)
      rect(ctx, shade(style.roof, 0.15), x + 2, y, 10, 2)
    }
  }
  rect(ctx, shade(style.roof, 0.25), 2, 2, width - 4, 4) // ridge highlight
  if (building.kind === 'market') {
    // Scalloped awning edge.
    for (let x = 2; x < width - 4; x += 24) {
      ellipse(ctx, style.roof, x + 12, roofHeight, 12, 6)
      ellipse(ctx, '#f2e8d5', x + 12, roofHeight - 2, 8, 3)
    }
  }
  rect(ctx, '#00000038', 10, roofHeight, width - 20, 6) // eave shadow

  // Door, centred on the doorstep the path leads to.
  const doorWidth = T * 2 - 32
  const doorX = Math.floor(building.cols / 2) * T - T + 16
  const doorTop = height - 92
  block(ctx, style.trim, shade(style.trim, -0.45), doorX - 6, doorTop - 6, doorWidth + 12, 86)
  rect(ctx, style.door, doorX, doorTop, doorWidth, 80)
  rect(ctx, shade(style.door, 0.15), doorX, doorTop, 4, 80)
  for (const py of [doorTop + 8, doorTop + 44]) {
    rect(ctx, shade(style.door, -0.25), doorX + 10, py, doorWidth - 20, 28) // panels
    rect(ctx, shade(style.door, 0.1), doorX + 12, py + 2, doorWidth - 24, 2)
  }
  disc(ctx, '#e9c46a', doorX + doorWidth - 12, doorTop + 42, 3)
  block(ctx, '#a69c8c', '#6f675b', doorX - 10, height - 12, doorWidth + 20, 6) // step
  if (building.kind === 'library') {
    for (const cx of [doorX - 30, doorX + doorWidth + 18]) {
      block(ctx, '#f4ecd8', '#a99f88', cx, wallTop + 8, 12, height - wallTop - 24)
      rect(ctx, '#ffffff', cx, wallTop + 8, 4, height - wallTop - 24)
    }
  }

  // Windows either side of the door, clear of it.
  const windowY = wallTop + 36
  for (let x = 32; x + 44 < width - 24; x += 80) {
    if (x + 60 > doorX - 36 && x - 16 < doorX + doorWidth + 36) continue
    windowAt(ctx, style, x, windowY, building.kind === 'cafe')
  }

  // Sign over the door: a framed board with the name.
  ctx.font = 'bold 22px ui-monospace, Menlo, monospace'
  const textWidth = Math.ceil(ctx.measureText(building.label).width)
  const signWidth = textWidth + 32
  const signX = Math.round(width / 2 - signWidth / 2)
  const signY = wallTop + 4
  block(ctx, '#5a3a22', '#2f1e11', signX, signY, signWidth, 32)
  rect(ctx, '#f4ecd8', signX + 4, signY + 4, signWidth - 8, 24)
  rect(ctx, '#ffffff', signX + 4, signY + 4, signWidth - 8, 2)
  ctx.fillStyle = '#3a2a1a'
  ctx.textBaseline = 'middle'
  ctx.fillText(building.label, signX + 16, signY + 17)

  return element
}

export function drawFountain(): HTMLCanvasElement {
  const size = T * 2
  const [element, ctx] = canvas(size, size)
  const c = size / 2
  ellipse(ctx, '#00000028', c, c + 8, 60, 56)
  disc(ctx, '#8f887a', c, c, 60) // rim outline
  disc(ctx, '#c9c2b4', c, c, 56)
  disc(ctx, '#ddd6c8', c - 4, c - 4, 50) // lit rim
  disc(ctx, '#3f7fa8', c, c, 46) // water
  disc(ctx, '#4f97c2', c, c, 42)
  for (const r of [34, 24]) {
    // Ripples, as rings of short arcs.
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      rect(ctx, '#7cb8db', c + Math.cos(a) * r - 2, c + Math.sin(a) * r - 1, 4, 2)
    }
  }
  disc(ctx, '#8f887a', c, c, 12) // basin pillar
  disc(ctx, '#bdb3a2', c, c, 10)
  disc(ctx, '#d6cebf', c - 2, c - 2, 6)
  // The spout: a column of water and falling drops.
  rect(ctx, '#bfe0f2', c - 2, c - 24, 4, 16)
  for (const [dx, dy] of [
    [-8, -18],
    [8, -16],
    [-12, -8],
    [12, -6],
  ] as const) {
    rect(ctx, '#e8f4fb', c + dx, c + dy, 2, 4)
  }
  disc(ctx, '#e8f4fb', c, c - 26, 3)
  return element
}
