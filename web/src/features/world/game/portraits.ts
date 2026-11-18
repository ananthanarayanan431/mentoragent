/**
 * Mentor portraits (their sprite's head and shoulders) as PNG data URLs, for the
 * dialogue boxes and settings. Plain canvas drawing, no Phaser, so a page can
 * load it without the game.
 */
import { appearanceFor } from './appearance'
import { drawPortrait } from './art'

const portraits = new Map<string, string>()

/** A mentor's portrait, cached per id; null where canvas is unavailable. */
export function portraitFor(id: string): string | null {
  const cached = portraits.get(id)
  if (cached) return cached
  try {
    const url = drawPortrait(appearanceFor(id)).toDataURL('image/png')
    portraits.set(id, url)
    return url
  } catch {
    return null
  }
}
