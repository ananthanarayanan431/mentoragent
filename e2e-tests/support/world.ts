import { expect, test as base, type Page } from '@playwright/test'

// The real map, so taps follow the layout if it changes.
import {
  buildWorldMap,
  MAP_COLS,
  MAP_ROWS,
  TILE,
  type Cell,
} from '../../web/src/features/world/game/map.ts'

export const WORLD = buildWorldMap()

/** Messages from the software WebGL renderer, not the app. */
const IGNORED_CONSOLE = [/GL Driver Message/, /GPU stall due to ReadPixels/]

/**
 * `test` with a `consoleErrors` fixture that fails the test on any console error or
 * uncaught page error. Every spec uses it, so a broken scene cannot pass quietly.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() !== 'error') return
        if (IGNORED_CONSOLE.some((pattern) => pattern.test(message.text()))) return
        errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export async function enterSquare(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /enter the square/i }).click()
  await expect(page.getByRole('heading', { name: 'Mentor Square' })).toBeHidden()
}

/** The screen-reader line announcing who is in reach ('' when nobody). */
export function announcement(page: Page) {
  return page.locator('p[aria-live="polite"]').first()
}

async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
}

/**
 * Walks west from the spawn (by the fountain) towards the nearest plaza mentors until
 * one is in reach, nudging north and south (mentors wander, so there is no fixed path).
 */
export async function walkToAMentor(page: Page): Promise<string> {
  const nudges = ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowDown']
  for (let i = 0; i < 60; i++) {
    const text = (await announcement(page).textContent()) ?? ''
    if (text) return text
    await hold(page, nudges[i % nudges.length]!, 140)
  }
  throw new Error('Walked for a while without any mentor coming into reach')
}

/**
 * Where `cell` is on screen right after entering, when the camera is centred on the
 * player's spawn. Mirrors the scene: zoom shows ~18 x 12 tiles, rounded to quarters
 * and never below 1; the camera is clamped to the map; sprites stand 18px above
 * their feet.
 */
export async function screenPointOf(page: Page, cell: Cell): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox()
  if (!box) throw new Error('The game canvas is not on screen')
  const zoom = Math.max(
    1,
    Math.round(Math.min(box.width / (18 * TILE), box.height / (12 * TILE)) * 4) / 4,
  )
  const viewW = box.width / zoom
  const viewH = box.height / zoom
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max)
  const feetToSprite = 18
  const player = WORLD.playerSpawn
  const scrollX = clamp(player.col * TILE + TILE / 2 - viewW / 2, MAP_COLS * TILE - viewW)
  const scrollY = clamp(
    player.row * TILE + TILE / 2 - feetToSprite - viewH / 2,
    MAP_ROWS * TILE - viewH,
  )
  return {
    x: box.x + (cell.col * TILE + TILE / 2 - scrollX) * zoom,
    y: box.y + (cell.row * TILE + TILE / 2 - feetToSprite - scrollY) * zoom,
  }
}
