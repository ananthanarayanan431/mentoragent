// Mocked MentorAgents backend for filming: seed mentors, no database, no keys.
import fs from 'node:fs'

const seed = JSON.parse(
  fs.readFileSync(
    '/Volumes/External/mentoragent/agents/mentor_agent/data/extraction_metadata.json',
    'utf8',
  ),
)
export const mentors = seed.map((m) => ({
  id: m.id,
  name: m.name,
  expertise: m.expertise,
  perspective: m.perspective,
  style: m.style,
  image_url: null,
  memory: 'ready',
}))

// Replies are lines each person actually published (public, well-known quotes),
// matching the product's claim that mentors answer from their own work.
export const replies = {
  opener: {
    charlie_munger: 'Invert, always invert. Tell me where you would fail, and we will start there.',
    warren_buffett: 'Pull up a bench. What are you trying to build?',
    peter_lynch: 'Know what you own, and know why you own it. What are you looking at?',
    ray_dalio: 'Pain plus reflection equals progress. What went wrong this week?',
  },
  answer: {
    charlie_munger:
      'Invert, always invert. Ask what would guarantee failure, then avoid it. And remember: it is not supposed to be easy.',
    warren_buffett:
      'Rule No. 1: never lose money. Rule No. 2: never forget Rule No. 1. Buy wonderful businesses at fair prices and sit tight.',
  },
}

export async function installMocks(page, { answerFor = 'charlie_munger', chunkMs = 45 } = {}) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname.replace('/api/v1', '')
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (p === '/mentors') return json(mentors)
    if (p === '/mentors/pool') return json({ remaining: 6, total: 10 })
    if (p.startsWith('/mentors/')) return json(mentors.find((m) => p.endsWith(m.id)) ?? mentors[0])
    if (p === '/goal') return json({ goal: null })
    if (p.startsWith('/ledger')) return json([])
    if (p === '/ambient') {
      const body = route.request().postDataJSON()
      const [a, b] = body.mentor_ids
      return json({
        id: 'amb1',
        mentor_ids: [a, b],
        about_user: false,
        created_at: new Date().toISOString(),
        lines: [
          { mentor_id: a, text: 'Compounding is the eighth wonder.' },
          { mentor_id: b, text: 'And patience is the ninth.' },
        ],
      })
    }
    return json({})
  })

  await page.routeWebSocket(/\/ws\/chat/, (ws) => {
    ws.onMessage(async (raw) => {
      const msg = JSON.parse(String(raw))
      const id = msg.mentor_id
      const conv = msg.conversation_id ?? 'conv-1'
      const text = msg.opener
        ? replies.opener[id]
        : (replies.answer[id] ?? replies.answer[answerFor])
      ws.send(JSON.stringify({ type: 'start', conversation_id: conv, mentor_id: id }))
      const words = text.split(/(?<= )/)
      for (const w of words) {
        await new Promise((r) => setTimeout(r, chunkMs))
        ws.send(JSON.stringify({ type: 'chunk', content: w, mentor_id: id }))
      }
      ws.send(JSON.stringify({ type: 'end', conversation_id: conv, response: text, mentor_id: id }))
    })
  })
}
