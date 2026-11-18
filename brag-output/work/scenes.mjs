// Renders one scene (or a continuous pair) of the video to PNG frames.
// usage: node scenes.mjs <A|B|C|DE|F> [--stills]
import { mkdirSync, rmSync } from 'node:fs'
import { open, streamer, FPS } from './harness.mjs'
import { window_, dip, easeInOut, easeOut, clamp } from './overlay.mjs'

const which = process.argv[2]
const stillsOnly = process.argv.includes('--stills')
const OUT = '/Volumes/External/mentoragent/brag-output/work/frames'
const T = 32
const ev = { clicks: [], typing: [], speech: [] }
import { writeFileSync } from 'node:fs'

// --- page helpers -----------------------------------------------------------
const world = (page) =>
  page.evaluate(() => {
    const s = window.__game.scene.scenes[0]
    return { px: s.player.sprite.x, py: s.player.sprite.y }
  })
const place = (page, id, x, y) =>
  page.evaluate(
    ([id, x, y]) => {
      const s = window.__game.scene.scenes[0]
      const m = s.mentors.find((m) => m.id === id)
      m.sprite.body.reset(x, y)
    },
    [id, x, y],
  )
const cam = (page, { zoom, x, y }) =>
  page.evaluate(
    ([zoom, x, y]) => {
      const c = window.__game.scene.scenes[0].cameras.main
      c.stopFollow()
      c.setZoom(zoom)
      c.centerOn(x, y)
    },
    [zoom, x, y],
  )
const follow = (page, zoom) =>
  page.evaluate((zoom) => {
    const s = window.__game.scene.scenes[0]
    const c = s.cameras.main
    if (zoom) c.setZoom(zoom)
    c.startFollow(s.player.sprite, true, 1, 1)
  }, zoom)
/** Screen position (page px) of a mentor or the player. */
const screenOf = (page, id) =>
  page.evaluate((id) => {
    const s = window.__game.scene.scenes[0]
    const c = s.cameras.main
    const sp = id ? s.mentors.find((m) => m.id === id).sprite : s.player.sprite
    const top = s.game.canvas.getBoundingClientRect().top
    return { x: (sp.x - c.worldView.x) * c.zoom, y: (sp.y - c.worldView.y) * c.zoom + top }
  }, id)
const enter = (page) => page.getByRole('button', { name: 'Enter the square' }).click()

async function shoot(ctx, name, dur, perFrame, { stills = [] } = {}) {
  const dir = `${OUT}/${name}`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const n = Math.round(dur * FPS)
  for (let f = 0; f < n; f++) {
    const t = f / FPS
    const spec = (await perFrame(t, f)) ?? {}
    await ctx.page.evaluate((s) => window.__ov(s), spec)
    const keep = !stillsOnly || stills.some((s) => Math.round(s * FPS) === f)
    if (keep) await ctx.page.screenshot({ path: `${dir}/f${String(f).padStart(4, '0')}.png` })
    await ctx.page.clock.runFor(1000 / FPS)
  }
  console.log(name, 'frames', n)
}

/** Moves the overlay cursor from p0 to p1 over [a,b]. */
const glide = (t, a, b, p0, p1) => {
  const k = easeInOut((t - a) / (b - a))
  return { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k }
}
const ringAt = (t, at, p) =>
  t >= at && t < at + 0.45
    ? {
        ...p,
        o: (1 - (t - at) / 0.45).toFixed(2),
        k: (0.4 + easeOut((t - at) / 0.45) * 0.9).toFixed(2),
      }
    : null

// --- A: the hook -------------------------------------------------------------
async function A() {
  const ctx = await open()
  const { page } = ctx
  await enter(page)
  const { px, py } = await world(page)
  const at = (c, r) => [px + c * T, py + r * T]
  await place(page, 'benjamin_graham', ...at(-3, -3.2))
  await place(page, 'peter_drucker', ...at(3.2, -3.4))
  await place(page, 'benjamin_franklin', ...at(-3.6, 1.6))
  await place(page, 'howard_marks', ...at(3.4, 1.8))
  await place(page, 'andrew_carnegie', ...at(0.8, 3.4))
  const DUR = 6
  const lines = [
    [0.05, 2.15, "What if history's<br>sharpest minds shared<br><em>one room?</em>"],
    [2.15, 4.1, 'How would their<br><em>knowledge flow?</em>'],
    [4.1, 6.0, 'And what would they<br>say about <em>you?</em>'],
  ]
  await shoot(
    ctx,
    'A',
    DUR,
    async (t) => {
      const z = 1.3 + easeInOut(t / DUR) * 0.55
      await cam(page, { zoom: z, x: px + 6, y: py - 0.8 * T })
      const hook = lines
        .map(([a, b, html]) => {
          const w = window_(t, a, b, 0.32, 0.16)
          return w && { ...w, html }
        })
        .filter(Boolean)
      return { dim: 0.78, hook, dip: t > DUR - 0.13 ? dip(t, DUR) : 0 }
    },
    { stills: [1.2, 2.2, 3.0, 5.0] },
  )
  await ctx.browser.close()
}

// --- B: the reveal (title screen, click Enter) ---------------------------------
async function B() {
  const ctx = await open()
  const { page } = ctx
  const DUR = 3.0
  const btn = await page.getByRole('button', { name: 'Enter the square' }).boundingBox()
  const target = { x: btn.x + btn.width / 2, y: btn.y + btn.height / 2 }
  let clicked = false
  await shoot(
    ctx,
    'B',
    DUR,
    async (t) => {
      if (!clicked) {
        const k = 1 + easeOut(t / 2.0) * 0.04
        await page.evaluate((k) => {
          document.getElementById('root').style.transform = `scale(${k})`
        }, k)
      }
      if (t >= 2.0 && !clicked) {
        clicked = true
        await page.evaluate(() => {
          document.getElementById('root').style.transform = ''
        })
        await enter(page)
        await page.mouse.move(5, 5)
      }
      const p = glide(
        t,
        0.8,
        1.7,
        { x: 860, y: 1000 },
        { x: target.x * 1.04 - 540 * 0.04, y: target.y * 1.04 - 540 * 0.04 },
      )
      const down = t >= 1.85 && t < 2.05
      return {
        cursor:
          t >= 0.6 && t < 2.4
            ? { ...p, o: clamp((t - 0.6) / 0.2) * (1 - clamp((t - 2.2) / 0.2)), k: down ? 0.85 : 1 }
            : null,
        ring: ringAt(t, 1.95, p),
        dip: t < 0.13 ? dip(t, DUR) : 0,
      }
    },
    { stills: [0.3, 1.5, 2.6] },
  )
  await ctx.browser.close()
}

// --- C: talk to one -----------------------------------------------------------
const QUESTION = 'How much runway do I need?'
const REPLY =
  "The Strategist says you're launching lean. Good. Keep enough runway to be wrong twice, and price for survival before growth."

async function C() {
  const ctx = await open()
  const { page, state } = ctx
  await enter(page)
  const { px, py } = await world(page)
  await place(page, 'benjamin_graham', px + 3.4 * T, py - 1.6 * T)
  await page.clock.runFor(100)
  const DUR = 9
  let s1 = null,
    s2 = null,
    typed = 0,
    sentAt = null,
    openedAt = null,
    clicked = false,
    tap = null
  state.onClient = (m) => {
    if (m.message) sentAt = 'now'
  }
  await shoot(
    ctx,
    'C',
    DUR,
    async (t, f) => {
      if (!tap) tap = await screenOf(page, 'benjamin_graham')
      if (t >= 0.5 && !clicked) {
        clicked = true
        ev.clicks.push(t)
        await page.mouse.click(tap.x, tap.y + 8)
        await page.mouse.move(5, 5)
      }
      if (t >= 2.0 && typed < QUESTION.length) {
        if (typed === 0) ev.typing.push([t, t + QUESTION.length / 2 / FPS])
        const chunk = QUESTION.slice(typed, typed + 2)
        typed += 2
        await page.keyboard.type(chunk)
        if (typed >= QUESTION.length) await page.keyboard.press('Enter')
      }
      if (sentAt === 'now') sentAt = t
      if (typeof sentAt === 'number' && t >= sentAt + 0.4) {
        if (!s2) {
          s2 = streamer(state, { conversation: 'c1', text: REPLY, perFrame: 2 })
          ev.speech.push([t, t + REPLY.length / 2 / FPS + 0.3])
        }
        s2.tick()
      }
      const p = glide(t, 0.1, 0.5, { x: 760, y: 900 }, { x: tap.x + 4, y: tap.y + 10 })
      const c1 = window_(t, 0.15, 3.0)
      const c2 = window_(t, 3.0, DUR - 0.05)
      return {
        cursor:
          t < 0.85
            ? {
                ...p,
                o: clamp(t / 0.15) * (1 - clamp((t - 0.65) / 0.2)),
                k: t > 0.5 && t < 0.65 ? 0.85 : 1,
              }
            : null,
        ring: ringAt(t, 0.48, p),
        chip: c1
          ? { ...c1, n: '1', html: 'Walk up to one. <em>Ask anything.</em>' }
          : c2
            ? {
                ...c2,
                n: '1',
                html: 'Replies stream live, grounded<br>in <em>their own writing.</em>',
              }
            : null,
        dip: t > DUR - 0.13 ? dip(t, DUR) : 0,
      }
    },
    { stills: [0.5, 2.5, 4.6, 6.5, 8.8] },
  )
  await ctx.browser.close()
}

// --- D + E: they talk, then you join -------------------------------------------
const AMBIENT = [
  'They want to launch without burning cash.',
  'Then they should sell it before building it.',
]
const Q2 = 'What should I build first?'
const R_BUILDER = 'The smallest thing someone will pay for this month.'
const R_STRAT = 'Agreed. Then write down who paid and why. That list is your strategy.'

async function DE() {
  const ctx = await open({ ambient: AMBIENT })
  const { page, state } = ctx
  await page.evaluate(() => {
    window.__pair = ['peter_drucker', 'andrew_carnegie']
    window.__ambientDelay = 250
  })
  await enter(page)
  const { px, py } = await world(page)
  await place(page, 'andrew_carnegie', px + 2.6 * T, py - 2.2 * T)
  await place(page, 'peter_drucker', px - 2.4 * T, py - 2.6 * T)
  await place(page, 'benjamin_graham', px - 9 * T, py + 6 * T)
  await place(page, 'howard_marks', px + 9 * T, py + 6 * T)
  await place(page, 'benjamin_franklin', px - 9 * T, py - 6 * T)
  await follow(page, 2.5)
  await page.evaluate(() =>
    window.__game.scene.scenes[0].options.bridge.commands.emit('labels', { visible: false }),
  )
  const D = 7
  await shoot(
    ctx,
    'D',
    D,
    async (t) => {
      const c1 = window_(t, 0.15, 3.7)
      const c2 = window_(t, 3.7, D + 1)
      return {
        chip: c1
          ? { ...c1, n: '2', html: 'Walk away, and <em>they talk about you.</em>' }
          : c2
            ? { ...c2, n: '2', html: 'What one learns, <em>the others hear.</em>' }
            : null,
        dip: t < 0.13 ? dip(t, D) : 0,
      }
    },
    { stills: [1.0, 2.5, 4.5, 7.0] },
  )

  // E: walk up to the pair and join them.
  const E = 7.5
  let tap = null,
    clicked = false,
    typed = 0,
    sent = null,
    sA = null,
    sB = null,
    spaced = false,
    aDoneAt = null,
    startedTyping = null
  state.onClient = (m) => {
    if (m.mentor_ids) sent = 'now'
  }
  await shoot(
    ctx,
    'E',
    E,
    async (t) => {
      if (!tap) tap = await screenOf(page, 'andrew_carnegie')
      if (t >= 0.5 && !clicked) {
        clicked = true
        ev.clicks.push(t)
        await page.mouse.click(tap.x, tap.y + 8)
        await page.mouse.move(5, 5)
      }
      const open = await page.locator('section[role=dialog]').count()
      if (open && startedTyping === null) startedTyping = t + 0.9
      if (startedTyping !== null && t >= startedTyping && typed < Q2.length) {
        const chunk = Q2.slice(typed, typed + 3)
        typed += 3
        await page.keyboard.type(chunk)
        if (typed === 3) ev.typing.push([t, t + Q2.length / 3 / FPS])
        if (typed >= Q2.length) await page.keyboard.press('Enter')
      }
      if (sent === 'now') sent = t
      if (typeof sent === 'number' && t >= sent + 0.3) {
        if (!sA) ev.speech.push([t, t + R_BUILDER.length / 3 / FPS + 0.2])
        if (!sA)
          sA = streamer(state, {
            conversation: 'g1',
            mentorId: 'andrew_carnegie',
            text: R_BUILDER,
            perFrame: 3,
          })
        if (!sA.done) sA.tick()
        else {
          if (aDoneAt === null) aDoneAt = t
          if (!sB)
            sB = streamer(state, {
              conversation: 'g1',
              mentorId: 'peter_drucker',
              text: R_STRAT,
              perFrame: 3,
            })
          if (!sB.done) {
            sB.tick()
            if (sB.done)
              state.socket.send(JSON.stringify({ type: 'turn_end', conversation_id: 'g1' }))
          }
          if (!spaced && t >= aDoneAt + 1.5) {
            spaced = true
            ev.clicks.push(t)
            ev.speech.push([t, t + 1.0])
            await page.keyboard.press(' ')
          }
        }
      }
      const p = glide(t, 0.05, 0.4, { x: 640, y: 860 }, { x: tap.x + 4, y: tap.y + 10 })
      const c = window_(t, 0.0, E - 0.05, 0.01)
      return {
        cursor:
          t < 0.75
            ? {
                ...p,
                o: clamp(t / 0.12) * (1 - clamp((t - 0.55) / 0.2)),
                k: t > 0.4 && t < 0.55 ? 0.85 : 1,
              }
            : null,
        ring: ringAt(t, 0.48, p),
        chip:
          t < 0.18
            ? (() => {
                const w = window_(t + D, 3.7, D + 1)
                return (
                  w && {
                    ...w,
                    n: '2',
                    html: 'What one learns, <em>the others hear.</em>',
                    o: (1 - t / 0.18).toFixed(2),
                  }
                )
              })()
            : {
                ...window_(t, 0.18, E - 0.05),
                n: '3',
                html: 'Join in. One answers,<br><em>the other builds on it.</em>',
              },
        dip: t > E - 0.13 ? dip(t, E) : 0,
      }
    },
    { stills: [0.6, 1.5, 3.0, 4.5, 6.8] },
  )
  await ctx.browser.close()
}

// --- F + End: memory, then the end card ------------------------------------------
async function F() {
  const ledger = [
    {
      id: 'l1',
      mentor_id: 'benjamin_graham',
      mentor_name: 'The Investor',
      topic: 'runway',
      advice: '',
      created_at: '2026-11-19T09:00:00Z',
    },
    {
      id: 'l2',
      mentor_id: 'andrew_carnegie',
      mentor_name: 'The Builder',
      topic: 'selling first',
      advice: '',
      created_at: '2026-11-19T09:10:00Z',
    },
    {
      id: 'l3',
      mentor_id: 'peter_drucker',
      mentor_name: 'The Strategist',
      topic: 'who paid and why',
      advice: '',
      created_at: '2026-11-19T09:11:00Z',
    },
  ]
  const ctx = await open({
    ledger,
    friendship: { benjamin_graham: 2, andrew_carnegie: 1, peter_drucker: 1 },
  })
  const { page } = ctx
  await enter(page)
  const { px, py } = await world(page)
  await place(page, 'benjamin_graham', px - 3.2 * T, py - 1.2 * T)
  await place(page, 'peter_drucker', px + 3.4 * T, py - 1.6 * T)
  await place(page, 'andrew_carnegie', px + 0.4 * T, py + 3.4 * T)
  await place(page, 'howard_marks', px + 10 * T, py + 6 * T)
  await place(page, 'benjamin_franklin', px - 10 * T, py - 6 * T)
  await follow(page, 2.3)
  const DUR = 6.5
  await shoot(
    ctx,
    'F',
    DUR,
    async (t) => {
      const c = window_(t, 0.15, 3.1)
      const e =
        t >= 3.0
          ? {
              o: easeOut((t - 3.0) / 0.35).toFixed(3),
              dy: ((1 - easeOut((t - 3.0) / 0.5)) * 30).toFixed(1),
              o2: easeOut((t - 3.5) / 0.35).toFixed(3),
            }
          : null
      return {
        chip: c
          ? { ...c, n: '', html: 'Every mentor remembers<br><em>what the others told you.</em>' }
          : null,
        end: e,
        dip: t < 0.13 ? dip(t, DUR) : 0,
      }
    },
    { stills: [1.5, 3.1, 4.2, 6.3] },
  )
  await ctx.browser.close()
}

await { A, B, C, DE, F }[which]()
if (!stillsOnly)
  writeFileSync(
    `/Volumes/External/mentoragent/brag-output/work/ev-${which}.json`,
    JSON.stringify(ev),
  )
