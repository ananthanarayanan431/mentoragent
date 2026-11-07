/**
 * Starts the Mentor Square game in `parent`. Imported lazily (`import()`), so the
 * Phaser bundle only loads when someone opens the world.
 */
import * as Phaser from 'phaser'

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
