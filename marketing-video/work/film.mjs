// Films the real web app for the launch video, against a mocked backend, with a
// frozen clock: every frame is a pure function of the steps taken.
//   PW_DIR=<dir with node_modules/playwright> node film2.mjs <outDir>
// Needs the web dev server on :5173 (pnpm dev). Writes <outDir>/<shot>/NNNN.png.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(process.env.PW_DIR + '/')
const { chromium } = require('playwright')

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const OUT = process.argv[2]
const FRAME = 1000 / 30
const seed = JSON.parse(
  fs.readFileSync(`${REPO}/agents/mentor_agent/data/extraction_metadata.json`, 'utf8'),
)

// --- Mock backend ---------------------------------------------------------------
const persona = (m, memory = 'ready') => ({
  id: m.id,
  name: m.name,
  expertise: m.expertise,
  perspective: m.perspective,
  style: m.style,
  image_url: null,
  memory,
})
const mentors = seed.map((m) => persona(m))
const EINSTEIN = {
  id: 'albert_einstein',
  name: 'Albert Einstein',
  expertise: 'Theoretical physics, thought experiments and the creative side of science',
  perspective:
    'Curiosity and imagination matter more than accumulated knowledge; question everything, especially authority.',
  style: 'Warm, playful and humble, with simple images and gentle humour.',
}
let einsteinMemory = 'building'
let ledger = []
const GOAL = 'Start my first company'

// Replies: real published lines where the mentor answers you directly; the
// cross-references between mentors are scripted to show the feature.
const SCRIPT = {
  albert_einstein:
    'If at first the idea is not absurd, then there is no hope for it. Imagination is more important than knowledge. Keep questioning.',
  charlie_munger:
    'I hear Einstein told you to chase the absurd idea. Fine. Now invert: what would kill it?',
  group: {
    charlie_munger:
      'Invert it. If it fails and you have no income, what then? Bet big only when the odds are heavily in your favor.',
    warren_buffett:
      "Charlie's right. Never risk what you have and need for what you don't have and don't need. Keep the job until it works.",
  },
}
const AMBIENT = [
  { mentor_id: 'warren_buffett', text: 'Charlie, our friend here wants to start a company.' },
  { mentor_id: 'charlie_munger', text: 'Good. Avoid stupidity first.' },
]

let socket = null
const outbox = []
let wordsPerFrame = 0
let carry = 0
function queueReply(ws, id, conv, text) {
  outbox.push({ ws, ev: { type: 'start', conversation_id: conv, mentor_id: id } })
  for (const w of text.split(/(?<= )/))
    outbox.push({ ws, ev: { type: 'chunk', content: w, mentor_id: id } })
  outbox.push({ ws, ev: { type: 'end', conversation_id: conv, response: text, mentor_id: id } })
}

async function installMocks(page) {
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
    const body = (await res.text()).replace(
      'useState(createWorldBridge)',
      'useState(() => (window.__bridge = createWorldBridge()))',
    )
    await route.fulfill({ response: res, body })
  })
  await page.route('**/src/features/world/use-ambient-chats.ts*', async (route) => {
    const res = await route.fetch()
    const body = (await res.text()).replace(
      'bridge.events.on("encounter", ({ mentorIds }) => {',
      'bridge.events.on("encounter", ({ mentorIds }) => { console.log("guard", JSON.stringify({ running: state.running, meeting: state.meeting, now: state.now(), from: state.encountersFrom, pairs: eligiblePairs(state.mentors).length, mentors: state.mentors.map((m) => m.id + ":" + m.memory) }));',
    )
    await route.fulfill({ response: res, body })
  })
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const p = new URL(req.url()).pathname.replace('/api/v1', '')
    const json = (b, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) })
    const all = () => [...mentors, ...(mentors.some((m) => m.id === EINSTEIN.id) ? [] : [])]
    if (p === '/mentors' && req.method() === 'POST') {
      const m = persona(EINSTEIN, 'building')
      mentors.push(m)
      return json(m, 201)
    }
    if (p === '/mentors')
      return json(all().map((m) => (m.id === EINSTEIN.id ? { ...m, memory: einsteinMemory } : m)))
    if (p === '/mentors/pool') return json({ remaining: 12, total: 12 })
    if (p.startsWith('/mentors/')) {
      const m = all().find((x) => p.includes(x.id)) ?? mentors[0]
      return json(m.id === EINSTEIN.id ? { ...m, memory: einsteinMemory } : m)
    }
    if (p === '/goal') return json({ goal: GOAL })
    if (p.startsWith('/ledger')) return json(ledger)
    if (p === '/ambient') {
      const { mentor_ids } = req.postDataJSON()
      return json({
        id: 'amb-1',
        mentor_ids,
        about_user: true,
        created_at: '2026-11-16T10:00:00Z',
        lines: AMBIENT,
      })
    }
    return json({})
  })
  await page.routeWebSocket(/\/ws\/chat/, (ws) => {
    socket = ws
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw))
      const conv = msg.conversation_id ?? 'conv-' + (msg.mentor_id ?? 'group')
      if (msg.mentor_ids) {
        for (const id of msg.mentor_ids) queueReply(ws, id, conv, SCRIPT.group[id])
        outbox.push({ ws, ev: { type: 'turn_end', conversation_id: conv } })
      } else if (msg.opener) {
        const text = SCRIPT['opener_' + msg.mentor_id]
        if (text) queueReply(ws, msg.mentor_id, conv, text)
        else outbox.push({ ws, ev: { type: 'silent', conversation_id: null } })
      } else {
        queueReply(ws, msg.mentor_id, conv, SCRIPT[msg.mentor_id] ?? 'Hm.')
      }
    })
  })
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'light')
    let s = 42
    Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  })
  await page.clock.install({ time: new Date('2026-11-16T10:00:00Z') })
}

// --- Filming helpers ------------------------------------------------------------
const browser = await chromium.launch({ channel: 'chrome' })
let page
let shotDir
let n = 0
const marks = {}
const settle = (ms = 15) => new Promise((r) => setTimeout(r, ms))
async function tick() {
  carry += wordsPerFrame
  while (carry >= 1 && outbox.length) {
    const { ws, ev } = outbox.shift()
    ws.send(JSON.stringify(ev))
    if (ev.type === 'chunk') carry -= 1
  }
  if (!outbox.length) carry = 0
  await page.clock.runFor(FRAME)
  await settle()
}
function shot(name) {
  shotDir = `${OUT}/${name}`
  fs.rmSync(shotDir, { recursive: true, force: true })
  fs.mkdirSync(shotDir, { recursive: true })
  n = 0
}
async function shoot(label) {
  if (label) marks[`${path.basename(shotDir)}.${label}`] = n
  await page.screenshot({ path: `${shotDir}/${String(n).padStart(4, '0')}.png` })
  n++
}
async function film(frames, before) {
  for (let i = 0; i < frames; i++) {
    if (before) await before(i)
    await tick()
    await shoot()
  }
}
async function typeSlow(text, perChar = 1) {
  for (const ch of text) {
    await page.keyboard.type(ch)
    await film(perChar)
  }
}
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
const sceneState = (id) =>
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
  }, id)
async function closeDialogue() {
  if (await dialogueOpen()) await page.keyboard.press('Escape')
  for (let i = 0; i < 10; i++) await tick()
  console.log('paused menu open?', await page.getByText(/resume/i).count())
}
const dialogueOpen = () => page.evaluate(() => Boolean(document.querySelector('textarea')))
// Tap the mentor on the canvas: the game paths the player there and opens the talk.
async function walkTo(id, { max = 400 } = {}) {
  // Follow the game's own path (findPath over the map), then tap the mentor.
  await page.evaluate(async (id) => {
    const { findPath, cellOf } = await import('/src/features/world/game/visits.ts')
    const { cellCenter } = await import('/src/features/world/game/map.ts')
    const s = window.__game.scene.scenes[0]
    const m = s.mentors.find((x) => x.id === id)
    const path = findPath(s.map, cellOf(s.feet(s.player)), cellOf(s.feet(m))) ?? []
    const waypoints = path.slice(0, -2).map(cellCenter)
    if (window.__walker) s.events.off('update', window.__walker)
    // Let the player slip past other mentors on the way (the path ignores people).
    const others = new Set(s.mentors.filter((x) => x.id !== id).map((x) => x.sprite))
    const blocking = s.physics.world.colliders
      .getActive()
      .filter((c) => others.has(c.object1) || others.has(c.object2))
    for (const c of blocking) c.active = false
    const restore = () => {
      for (const c of blocking) c.active = true
    }
    window.__walker = () => {
      if (s.pointerTarget) return
      const next = waypoints.shift()
      s.stuckMs = 0
      if (next) s.pointerTarget = { point: next, mentor: null }
      else {
        s.pointerTarget = { point: s.feet(m), mentor: m }
        s.events.off('update', window.__walker)
        restore()
      }
    }
    s.events.on('update', window.__walker)
  }, id)
  for (let i = 0; i < max; i++) {
    await tick()
    await shoot()
    if (await dialogueOpen()) return true
  }
  console.log(
    'walk failed',
    JSON.stringify(await sceneState(id)),
    await page.evaluate(() => {
      const s = window.__game.scene.scenes[0]
      return JSON.stringify({
        pt: !!s.pointerTarget,
        input: s.inputEnabled,
        paused: s.paused,
        stuck: s.stuckMs,
      })
    }),
  )
  return false
}

// --- Shot 1: create Albert Einstein (mentors page) -------------------------------
if (process.env.SKIP_CREATE) {
  mentors.push(persona(EINSTEIN))
  einsteinMemory = 'ready'
} else {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 })
  page.on('pageerror', (e) => console.log('pageerror:', e.message))
  await installMocks(page)
  await page.goto('http://localhost:5173/mentors')
  for (let i = 0; i < 90; i++) await tick()
  await page.getByRole('button', { name: /create a mentor/i }).click()
  for (let i = 0; i < 10; i++) await tick()
  shot('create')
  await film(8)
  await page.getByPlaceholder('e.g. Morgan Housel').click()
  await film(3)
  await typeSlow('Albert Einstein', 2)
  await film(12)
  await page.getByRole('button', { name: /^create mentor$/i }).click()
  await film(30, (i) => {
    if (i === 0) marks['create.submit'] = n
  })
  await page.evaluate(() => window.scrollTo(0, 0))
  await film(30)
  await page.screenshot({ path: `${OUT}/debug-create.png` })
  einsteinMemory = 'ready'
  marks['create.ready'] = n
  await film(170) // the page polls every 5 s; the card flips to ready on screen
  await page.close()
}

// --- Square shots ---------------------------------------------------------------
page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('pageerror', (e) => console.log('pageerror:', e.message))
page.on(
  'console',
  (m) => /visit|encounter|cmd|guard/.test(m.text()) && console.log('page:', m.text()),
)
await installMocks(page)
socket = null
await page.goto('http://localhost:5173/')
for (let i = 0; i < 400; i++) {
  await tick()
  if (
    i > 60 &&
    (await page.evaluate(() =>
      Boolean(window.__game?.scene?.scenes?.[0]?.player && window.__bridge),
    ))
  )
    break
}
// StrictMode builds the bridge twice in dev; the game holds the live one.
await page.evaluate(() => (window.__bridge = window.__game.scene.scenes[0].options.bridge))
await page.getByRole('button', { name: /enter the square/i }).click()
for (let i = 0; i < 45; i++) await tick()
console.log(
  'mentors in scene:',
  await page.evaluate(() => window.__game.scene.scenes[0].mentors.map((m) => m.id)),
)

// Shot 2: walk to Einstein, ask him.
await hold(['ArrowDown'])
for (let i = 0; i < 20; i++) await tick()
await hold([])
shot('einstein')
console.log('reached einstein:', await walkTo(EINSTEIN.id))
marks['einstein.arrive'] = n
wordsPerFrame = 0.34
await film(30)
marks['einstein.typing'] = n
await typeSlow('Is my startup idea crazy?')
await film(6)
await page.keyboard.press('Enter')
marks['einstein.send'] = n
await film(150)
marks['einstein.done'] = n
await film(20)
ledger = [
  {
    id: 'l1',
    mentor_id: EINSTEIN.id,
    mentor_name: 'Albert Einstein',
    topic: 'Absurd ideas',
    advice: 'Chase the idea that sounds absurd; imagination beats knowledge.',
    created_at: '2026-11-16T10:01:00Z',
  },
]
await closeDialogue()
for (let i = 0; i < 10; i++) await tick()

// Shot 3: walk to Munger; he speaks first about what Einstein said.
shot('munger')
console.log('reached munger:', await walkTo('charlie_munger'))
marks['munger.arrive'] = n
await film(15)
marks['munger.typing'] = n
await typeSlow('Any advice?')
await film(6)
await page.keyboard.press('Enter')
marks['munger.send'] = n
await film(110)
marks['munger.done'] = n
await film(15)
await closeDialogue()
for (let i = 0; i < 10; i++) await tick()

// Shot 4: Buffett walks over to Munger and they talk; the player joins them.
await page.evaluate(() => {
  window.__met = false
  window.__says = []
  window.__bridge.events.on('met', () => (window.__met = true))
  window.__bridge.events.on('visitFailed', (e) => console.log('visitFailed', JSON.stringify(e)))
  window.__bridge.events.on('encounter', (e) => console.log('encounter', JSON.stringify(e)))
  const emit = window.__bridge.commands.emit.bind(window.__bridge.commands)
  window.__bridge.commands.emit = (name, payload) => {
    if (name === 'say') window.__says.push(payload.text)
    if (name === 'visit' || name === 'endVisit') console.log('cmd', name, JSON.stringify(payload))
    return emit(name, payload)
  }
})
await hold(['ArrowDown'])
for (let i = 0; i < 12; i++) await tick()
await hold([])
console.log(
  'hook menu?',
  await page.locator('[role=dialog]').count(),
  await page.evaluate(() => document.visibilityState),
)
await page.evaluate(() =>
  window.__bridge.events.emit('encounter', { mentorIds: ['warren_buffett', 'charlie_munger'] }),
)
shot('meet')
let met = false
for (let i = 0; i < 300; i++) {
  await tick()
  await shoot()
  if (await page.evaluate(() => window.__met)) {
    met = true
    break
  }
}
console.log('met:', met)
marks['meet.met'] = n
await film(80)
console.log('says:', await page.evaluate(() => window.__says))

// Shot 5: join them and ask both.
shot('join')
console.log('reached munger again:', await walkTo('charlie_munger'))
await film(20)
marks['join.typing'] = n
await typeSlow('Should I quit my job for it?')
await film(6)
await page.keyboard.press('Enter')
marks['join.send'] = n
wordsPerFrame = 0.4
for (let i = 0; i < 280; i++) {
  await tick()
  await shoot()
  // Space moves to the second speaker once the first has finished.
  if (i === 140) {
    await page.keyboard.press('Space')
    marks['join.second'] = n
  }
}
fs.writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 1))
console.log(marks)
await browser.close()
