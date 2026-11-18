/**
 * Starts the Mentor Square game in `parent`. Imported lazily (`import()`), so the
 * Phaser bundle only loads when someone opens the world.
 */
import * as Phaser from 'phaser'

import { appearanceFor } from './appearance'
import { drawPortrait } from './art'
import { WorldScene, type WorldSceneOptions } from './world-scene'

export function createGame(parent: HTMLElement, options: WorldSceneOptions): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#2f4a2c',
    pixelArt: true,
    banner: false,
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || 800,
      height: parent.clientHeight || 600,
    },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
    scene: new WorldScene(options),
  })
}

const portraits = new Map<string, string>()

/**
 * A mentor's portrait (their sprite's head and shoulders) as a PNG data URL, for
 * the dialogue box. Cached per id; null where canvas is unavailable.
 */
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
