// Renders comp.html frame by frame: node render.mjs <outDir> [frame,frame,...]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(process.env.PW_DIR + '/')
const { chromium } = require('playwright')
const here = path.dirname(new URL(import.meta.url).pathname)
const out = process.argv[2]
const list = process.argv[3]
  ? process.argv[3].split(',').map(Number)
  : [...Array(Number(process.env.TOTAL ?? 765)).keys()]
fs.mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto('file://' + path.join(here, 'comp.html'))
await page.evaluate(() => document.fonts.ready)
for (const f of list) {
  await page.evaluate((f) => window.seek(f), f)
  await page.screenshot({ path: `${out}/${String(f).padStart(4, '0')}.png` })
}
await browser.close()
