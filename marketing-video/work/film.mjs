// Films the real Mentor Square at 30fps with a frozen clock: every frame is a
// pure function of the steps taken, so a re-run gives the same footage.
import fs from 'node:fs'
import { chromium } from 'playwright'
import { mentors, replies } from './mock.mjs'

const OUT = process.argv[2]
fs.mkdirSync(OUT, { recursive: true })
const FRAME = 1000 / 30
const MUNGER = 'charlie_munger'
const QUESTION = 'How do I avoid the big mistakes?'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()))
page.on('pageerror', (e) => console.log('pageerror:', e.message))

// Expose the game and the bridge (dev modules only, nothing in the repo changes).
await page.route('**/src/features/world/game/create-game.ts*', async (route) => {
  const res = await route.fetch()
  const body = (await res.text()).replace(
    'return new Phaser.Game(',
    'return window.__game = new Phaser.Game(',
  )
  await route.fulfill({ response: res, body })
})
await page.route('**/src/features/world/world-page.tsx*', async (route) => {
  const res = await route.fetch()
  const src = await res.text()
  const body = src.replace(
    'useState(createWorldBridge)',
    'useState(() => (window.__bridge = createWorldBridge()))',
  )
  if (body === src) console.log('WARN: bridge patch did not apply')
  await route.fulfill({ response: res, body })
})

// Mocked REST.
await page.route('**/api/v1/**', async (route) => {
  const p = new URL(route.request().url()).pathname.replace('/api/v1', '')
  const json = (b) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })
  if (p === '/mentors') return json(mentors)
  if (p === '/mentors/pool') return json({ remaining: 6, total: 10 })
  if (p === '/mentors/random') {
    const g = JSON.parse(
      fs.readFileSync(
        '/Volumes/External/mentoragent/agents/mentor_agent/data/mentor_pool.json',
        'utf8',
      ),
    )[0]
    const m = {
      id: g.id,
      name: g.name,
      expertise: g.expertise,
      perspective: g.perspective,
      style: g.style,
      image_url: null,
      memory: 'building',
    }
    mentors.push(m)
    return json(m)
  }
  if (p.startsWith('/mentors/')) return json(mentors.find((m) => p.endsWith(m.id)) ?? mentors[0])
  if (p === '/goal') return json({ goal: null })
  if (p.startsWith('/ledger')) return json([])
  if (p === '/ambient') return route.fulfill({ status: 503, body: '{}' }) // we script meetings ourselves
  return json({})
})

// Mocked WebSocket: replies are queued and released one word per frame tick.
let socket = null
const outbox = []
await page.routeWebSocket(/\/ws\/chat/, (ws) => {
  socket = ws
  ws.onMessage((raw) => {
    const msg = JSON.parse(String(raw))
    const id = msg.mentor_id
    const conv = msg.conversation_id ?? 'conv-1'
    const text = msg.opener ? replies.opener[id] : replies.answer[id]
    outbox.push({ type: 'start', conversation_id: conv, mentor_id: id })
    for (const w of text.split(/(?<= )/)) outbox.push({ type: 'chunk', content: w, mentor_id: id })
    outbox.push({ type: 'end', conversation_id: conv, response: text, mentor_id: id })
  })
})

await page.addInitScript(() => {
  localStorage.setItem('theme', 'light')
  let s = 42
  Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
})
await page.clock.install({ time: new Date('2026-11-16T10:00:00Z') })
await page.goto('http://localhost:5173/')

const settle = (ms = 15) => new Promise((r) => setTimeout(r, ms))
let wordsPerFrame = 0
async function tick() {
  for (let i = 0; i < wordsPerFrame && outbox.length && socket; i++)
    socket.send(JSON.stringify(outbox.shift()))
  await page.clock.runFor(FRAME)
  await settle()
}

// Boot without filming until the world is running.
for (let i = 0; i < 400; i++) {
  await tick()
  const ok = await page.evaluate(() =>
    Boolean(window.__game?.scene?.scenes?.[0]?.player && window.__bridge),
  )
  if (ok && i > 60) break
}
await page.getByRole('button', { name: /enter the square/i }).click()
for (let i = 0; i < 45; i++) await tick()

let n = 0
const marks = {}
async function shoot(label) {
  if (label) marks[label] = n
  await page.screenshot({ path: `${OUT}/${String(n).padStart(4, '0')}.png` })
  n++
}
async function film(frames, before) {
  for (let i = 0; i < frames; i++) {
    if (before) await before(i)
    await tick()
    await shoot()
  }
}

const state = () =>
  page.evaluate((id) => {
    const s = window.__game.scene.scenes[0]
    const m = s.mentors.find((x) => x.id === id)
    return {
      px: s.player.sprite.x,
      py: s.player.sprite.y,
      mx: m.sprite.x,
      my: m.sprite.y,
      near: s.nearby?.id ?? null,
    }
  }, MUNGER)

// Shot A: walk up to Charlie Munger.
const held = new Set()
async function hold(keys) {
  for (const k of [...held])
    if (!keys.includes(k)) {
      await page.keyboard.up(k)
      held.delete(k)
    }
  for (const k of keys)
    if (!held.has(k)) {
      await page.keyboard.down(k)
      held.add(k)
    }
}
await hold(['ArrowDown', 'ArrowLeft'])
for (let i = 0; i < 40; i++) await tick()
await hold([])
for (let i = 0; i < 10; i++) await tick()
marks.walkStart = n
let arrived = -1
for (let i = 0; i < 300; i++) {
  const s = await state()
  if (s.near === MUNGER) {
    arrived = i
    break
  }
  const dx = s.mx - s.px,
    dy = s.my - s.py
  const keys = []
  if (Math.abs(dx) > 30) keys.push(dx > 0 ? 'ArrowRight' : 'ArrowLeft')
  if (Math.abs(dy) > 30) keys.push(dy > 0 ? 'ArrowDown' : 'ArrowUp')
  await hold(keys)
  await tick()
  await shoot()
}
await hold([])
console.log('arrived at frame', arrived, 'n', n)
await film(12)

// Shot B: Space opens the dialogue; the opener streams in.
marks.talk = n
await page.keyboard.press('Space')
wordsPerFrame = 0.5
let flip = 0
await film(75, () => {
  wordsPerFrame = flip++ % 3 === 0 ? 1 : 0
})
// Type the question.
marks.typing = n
const box = page.locator('textarea, input[type="text"]').last()
await box.focus().catch(() => {})
for (const ch of QUESTION) {
  await page.keyboard.type(ch)
  await tick()
  await shoot()
}
await film(8)
marks.send = n
await page.keyboard.press('Enter')
flip = 0
await film(150, () => {
  wordsPerFrame = flip++ % 3 === 0 ? 1 : 0
})
marks.answerDone = n
await film(20)

// Shot C: close the dialogue; Warren Buffett walks over to Peter Lynch and they talk.
await page.keyboard.press('Escape')
for (let i = 0; i < 10; i++) await tick()
marks.addStart = n
await film(10)
await page.getByRole('button', { name: /add a mentor/i }).click()
marks.addClick = n
await film(40)
const confirm = page.getByRole('button', { name: /add|invite|bring/i }).last()
console.log('buttons:', await page.getByRole('button').allInnerTexts())
await page.screenshot({ path: 'add-menu.png' })
await film(80)
marks.end = n
fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 1))
console.log(marks)
await browser.close()
