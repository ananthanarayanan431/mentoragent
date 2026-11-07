/**
 * A character's look, derived from their id so every mentor (including ones added
 * later in MongoDB) gets a stable, distinct sprite without any art files.
 */

export type HairStyle = 'short' | 'bald' | 'long' | 'side' | 'bun'
export type Accessory = 'none' | 'glasses' | 'tie' | 'hat' | 'scarf'

export interface Appearance {
  skin: string
  hair: string
  hairStyle: HairStyle
  outfit: string
  trim: string
  trousers: string
  accessory: Accessory
}

const SKINS = ['#f6d3b3', '#eab68e', '#d39b6f', '#b07850', '#8a5a3b', '#6b4329']
const HAIRS = ['#2b2118', '#5a3a22', '#8b5a2b', '#c9c3b8', '#e8e4dc', '#b5452a', '#3c3c44']
const HAIR_STYLES: HairStyle[] = ['short', 'bald', 'long', 'side', 'bun']
const OUTFITS = [
  '#3e5c8a',
  '#7a3b5d',
  '#2f6b4f',
  '#8a5a2b',
  '#4b4f8c',
  '#9c3d3d',
  '#3d6f7d',
  '#6b5b3e',
]
const TRIMS = ['#e9c46a', '#f4f1de', '#e07a5f', '#81b29a', '#f2cc8f']
const TROUSERS = ['#2d3142', '#3a3a3a', '#4f3b2a', '#283845']
const ACCESSORIES: Accessory[] = ['none', 'glasses', 'tie', 'hat', 'scarf']

/** FNV-1a: a small, well-spread string hash. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function pick<T>(options: readonly T[], hash: number, salt: number): T {
  // Mix the salt in so each attribute varies independently of the others.
  const mixed = Math.imul(hash ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b) >>> 0
  return options[mixed % options.length]!
}

export function appearanceFor(id: string): Appearance {
  const hash = hashString(id)
  return {
    skin: pick(SKINS, hash, 1),
    hair: pick(HAIRS, hash, 2),
    hairStyle: pick(HAIR_STYLES, hash, 3),
    outfit: pick(OUTFITS, hash, 4),
    trim: pick(TRIMS, hash, 5),
    trousers: pick(TROUSERS, hash, 6),
    accessory: pick(ACCESSORIES, hash, 7),
  }
}

/** The player: a fixed look, so they always stand out from the mentors. */
export const PLAYER_APPEARANCE: Appearance = {
  skin: '#eab68e',
  hair: '#5a3a22',
  hairStyle: 'short',
  outfit: '#e76f51',
  trim: '#f4f1de',
  trousers: '#264653',
  accessory: 'hat',
}
