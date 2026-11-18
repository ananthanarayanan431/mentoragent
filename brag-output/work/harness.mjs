// Drives the real Mentor Square (Vite dev server on :5173) in headless Chromium with a
// mocked API and socket, stepping a fake clock one video frame at a time.
import { createRequire } from 'node:module'
import { OVERLAY_INIT } from './overlay.mjs'
const require = createRequire(import.meta.url)
const {
  chromium,
} = require('/Volumes/External/mentoragent/node_modules/.pnpm/playwright@1.65.0/node_modules/playwright')

export const APP = 'http://localhost:5173'
export const FPS = 30
export const SIZE = 1080

// Five mentors, shown only as archetypes (no real names on screen).
export const MENTORS = [
  { id: 'benjamin_graham', name: 'The Investor', expertise: 'Margin of safety' },
  { id: 'peter_drucker', name: 'The Strategist', expertise: 'Management' },
  { id: 'benjamin_franklin', name: 'The Inventor', expertise: 'Thrift and enterprise' },
  { id: 'howard_marks', name: 'The Contrarian', expertise: 'Risk and cycles' },
  { id: 'andrew_carnegie', name: 'The Builder', expertise: 'Scale and cost' },
].map((m) => ({
  ...m,
  perspective: '',
  style: '',
  image_url: null,
  in_square: true,
  memory: 'ready',
}))

export const GOAL = 'Launch my first product without running out of money'
const now = '2026-11-19T10:00:00Z'

export async function open({ ledger = [], ambient = null, friendship = null } = {}) {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const context = await browser.newContext({
    viewport: { width: SIZE, height: SIZE },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  })
  const page = await context.newPage()
  const state = { ledger, ambient, socket: null, onClient: null }

  await page.addInitScript(
    ({ friendship }) => {
      // Deterministic randomness for wandering and pairing.
      let s = 1234567
      Math.random = () => {
        s |= 0
        s = (s + 0x6d2b79f5) | 0
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      window.__noEncounter = true
      try {
        localStorage.clear()
        localStorage.setItem('mentoragent:theme', 'light')
        if (friendship)
          localStorage.setItem('mentoragent:world:friendship', JSON.stringify(friendship))
      } catch {}
    },
    { friendship },
  )

  await page.addInitScript(OVERLAY_INIT)

  // Patch three modules as Vite serves them (nothing in the repo changes).
  const patch = async (url, fn) =>
    page.route(`${APP}${url}*`, async (route) => {
      const res = await route.fetch()
      route.fulfill({ response: res, body: fn(await res.text()) })
    })
  await patch('/src/features/world/game/create-game.ts', (t) =>
    t.replace('return new Phaser.Game(', 'return window.__game = new Phaser.Game('),
  )
  await patch('/src/features/world/ambient.ts', (t) =>
    t
      .replace(
        'export function nextDelayMs(rng) {',
        'export function nextDelayMs(rng) { if (window.__ambientDelay != null) return window.__ambientDelay;',
      )
      .replace(
        'export function pickPair(pairs, rng, last) {',
        'export function pickPair(pairs, rng, last) { if (window.__pair) return window.__pair;',
      ),
  )
  await patch('/src/features/world/game/world-scene.ts', (t) =>
    t.replace(
      'this.options.bridge.events.emit("encounter",',
      'if (!window.__noEncounter) this.options.bridge.events.emit("encounter",',
    ),
  )

  const json = (route, body) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route(`${APP}/api/v1/**`, async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname.replace('/api/v1', '')
    if (p === '/mentors') return json(route, MENTORS)
    if (p === '/squares')
      return json(route, [
        {
          id: 'main',
          name: 'Founder square',
          goal: GOAL,
          mentor_ids: MENTORS.map((m) => m.id),
          created_at: now,
        },
      ])
    if (p === '/goal') return json(route, { goal: GOAL })
    if (p === '/ledger') return json(route, state.ledger)
    if (p === '/ambient') {
      const ids = JSON.parse(route.request().postData()).mentor_ids
      const lines = (state.ambient ?? []).map((l, i) => ({ mentor_id: ids[i % 2], text: l }))
      return json(route, { id: 'amb1', about_user: true, created_at: now, lines, mentor_ids: ids })
    }
    return json(route, {})
  })
  await page.routeWebSocket(/\/api\/v1\/ws\/chat/, (ws) => {
    state.socket = ws
    ws.onMessage((msg) => state.onClient?.(JSON.parse(String(msg))))
  })

  await page.clock.install({ time: new Date('2026-11-19T10:00:00Z') })
  await page.goto(APP + '/')
  await page.getByRole('button', { name: 'Enter the square' }).waitFor({ timeout: 30000 })
  await page.evaluate(() => document.fonts.ready)
  await page.clock.pauseAt(new Date('2026-11-19T10:00:05Z'))

  const scene = () =>
    page.evaluate(() => {
      const s = window.__game.scene.scenes[0]
      const cam = s.cameras.main
      const at = (sp) => ({
        x: (sp.x - cam.worldView.x) * cam.zoom,
        y: (sp.y - cam.worldView.y) * cam.zoom + (cam.y || 0),
      })
      return {
        player: at(s.player.sprite),
        mentors: Object.fromEntries(s.mentors.map((m) => [m.id, at(m.sprite)])),
        canvasTop: s.game.canvas.getBoundingClientRect().top,
      }
    })

  return { browser, page, state, scene }
}

/** Streams a reply over the mocked socket, a few characters per call to `tick`. */
export function streamer(state, { conversation = 'c1', mentorId, text, perFrame = 3 }) {
  let i = 0
  let started = false
  return {
    done: false,
    tick() {
      if (this.done) return
      const ws = state.socket
      const extra = mentorId ? { mentor_id: mentorId } : {}
      if (!started) {
        ws.send(JSON.stringify({ type: 'start', conversation_id: conversation, ...extra }))
        started = true
        return
      }
      if (i < text.length) {
        const chunk = text.slice(i, i + perFrame)
        i += perFrame
        ws.send(JSON.stringify({ type: 'chunk', content: chunk, ...extra }))
        return
      }
      ws.send(
        JSON.stringify({ type: 'end', conversation_id: conversation, response: text, ...extra }),
      )
      this.done = true
    },
  }
}
