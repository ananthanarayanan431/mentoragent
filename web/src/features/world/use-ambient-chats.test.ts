import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api'
import type { AmbientChat, Mentor } from '@/lib/types'
import { AMBIENT_MIN_DELAY_MS, ENCOUNTER_RETRY_MS, lineDurationMs, MAX_TALK_MS } from './ambient'
import { useAmbientChats } from './use-ambient-chats'
import { createWorldBridge, type WorldBridge } from './world-bridge'

const api = vi.hoisted(() => ({
  startAmbientChat: vi.fn<(ids: [string, string]) => Promise<AmbientChat>>(),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  startAmbientChat: api.startAmbientChat,
}))

const MENTORS: Mentor[] = ['buffett', 'munger'].map((id) => ({
  id,
  name: id,
  expertise: 'e',
  perspective: 'p',
  style: 's',
  memory: 'ready',
}))
const CHAT: AmbientChat = {
  id: 'amb1',
  mentor_ids: ['buffett', 'munger'],
  about_user: true,
  lines: [
    { mentor_id: 'buffett', text: 'Index funds.' },
    { mentor_id: 'munger', text: 'Agreed.' },
  ],
  created_at: '2026-11-15T10:00:00Z',
}

let bridge: WorldBridge
let commands: { name: string; payload: unknown }[]

function render(active = true) {
  return renderHook(
    ({ on }) => useAmbientChats({ bridge, active: on, mentors: MENTORS, random: () => 0 }),
    { initialProps: { on: active } },
  )
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  bridge = createWorldBridge()
  commands = []
  for (const name of ['visit', 'greet', 'say', 'endVisit'] as const) {
    bridge.commands.on(name, (payload) => commands.push({ name, payload }))
  }
  api.startAmbientChat.mockResolvedValue(CHAT)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAmbientChats', () => {
  it('sends one mentor over to another after a few minutes', async () => {
    render()
    await wait(AMBIENT_MIN_DELAY_MS - 1)
    expect(commands).toEqual([])

    await wait(1)

    expect(commands).toEqual([
      { name: 'visit', payload: { visitorId: 'buffett', hostId: 'munger' } },
    ])
  })

  it('plays their chat once they meet, then lets them go', async () => {
    const { result } = render()
    await wait(AMBIENT_MIN_DELAY_MS)
    act(() => bridge.events.emit('met', { visitorId: 'buffett', hostId: 'munger' }))
    await wait(0)

    expect(api.startAmbientChat).toHaveBeenCalledWith(['buffett', 'munger'])
    expect(commands.at(-1)).toEqual({
      name: 'say',
      payload: { mentorId: 'buffett', text: 'Index funds.' },
    })
    expect(result.current?.ambientId).toBe('amb1')

    await wait(lineDurationMs('Index funds.'))
    expect(commands.at(-1)).toEqual({
      name: 'say',
      payload: { mentorId: 'munger', text: 'Agreed.' },
    })

    await wait(lineDurationMs('Agreed.'))
    expect(commands.at(-1)).toEqual({
      name: 'endVisit',
      payload: { visitorId: 'buffett', hostId: 'munger' },
    })
    expect(result.current?.endedAt).not.toBeNull()
  })

  it('does nothing while the square is not being played', async () => {
    render(false)
    await wait(AMBIENT_MIN_DELAY_MS * 2)
    expect(commands).toEqual([])
  })

  it('ends a meeting when play stops halfway', async () => {
    const { rerender } = render()
    await wait(AMBIENT_MIN_DELAY_MS)
    act(() => bridge.events.emit('met', { visitorId: 'buffett', hostId: 'munger' }))
    await wait(0)

    rerender({ on: false })

    expect(commands.at(-1)).toEqual({
      name: 'endVisit',
      payload: { visitorId: 'buffett', hostId: 'munger' },
    })
    await wait(AMBIENT_MIN_DELAY_MS * 2)
    expect(commands.filter((c) => c.name === 'say')).toHaveLength(1)
  })

  it('skips quietly when the server says not now, and tries again later', async () => {
    api.startAmbientChat.mockRejectedValue(new ApiError('Too many requests.', 429))
    const { result } = render()
    await wait(AMBIENT_MIN_DELAY_MS)
    act(() => bridge.events.emit('met', { visitorId: 'buffett', hostId: 'munger' }))
    await wait(0)

    expect(commands.at(-1)?.name).toBe('endVisit')
    expect(result.current?.ambientId).toBeNull()

    await wait(AMBIENT_MIN_DELAY_MS)
    expect(commands.filter((c) => c.name === 'visit')).toHaveLength(2)
  })

  it('tries again later when the walk fails', async () => {
    const { result } = render()
    await wait(AMBIENT_MIN_DELAY_MS)
    act(() => bridge.events.emit('visitFailed', { visitorId: 'buffett', hostId: 'munger' }))

    expect(result.current?.endedAt).not.toBeNull()
    await wait(AMBIENT_MIN_DELAY_MS)
    expect(commands.filter((c) => c.name === 'visit')).toHaveLength(2)
  })

  it('lets them talk for thirty seconds at most, however long the lines', async () => {
    api.startAmbientChat.mockResolvedValue({
      ...CHAT,
      lines: Array.from({ length: 4 }, (_, i) => ({
        mentor_id: i % 2 ? 'munger' : 'buffett',
        text: 'x'.repeat(400),
      })),
    })
    render()
    await wait(AMBIENT_MIN_DELAY_MS)
    act(() => bridge.events.emit('met', { visitorId: 'buffett', hostId: 'munger' }))
    await wait(0)

    await wait(MAX_TALK_MS)

    expect(commands.filter((c) => c.name === 'say')).toHaveLength(4)
    expect(commands.at(-1)).toEqual({
      name: 'endVisit',
      payload: { visitorId: 'buffett', hostId: 'munger' },
    })
  })

  it('lets two mentors who bump into each other stop and chat', async () => {
    render()
    act(() => bridge.events.emit('encounter', { mentorIds: ['munger', 'buffett'] }))

    expect(commands).toEqual([
      { name: 'visit', payload: { visitorId: 'munger', hostId: 'buffett' } },
    ])
  })

  it('has them just say hello when the last chat was under three minutes ago', async () => {
    render()
    act(() => bridge.events.emit('encounter', { mentorIds: ['munger', 'buffett'] }))
    act(() => bridge.events.emit('met', { visitorId: 'munger', hostId: 'buffett' }))
    await wait(MAX_TALK_MS) // the chat plays and ends
    await wait(AMBIENT_MIN_DELAY_MS - MAX_TALK_MS - 1000)

    act(() => bridge.events.emit('encounter', { mentorIds: ['buffett', 'munger'] }))

    expect(commands.filter((c) => c.name === 'visit')).toHaveLength(1)
    expect(commands.at(-1)).toEqual({
      name: 'greet',
      payload: { visitorId: 'buffett', hostId: 'munger' },
    })
    expect(api.startAmbientChat).toHaveBeenCalledTimes(1)
  })

  it('has others say hello while a real chat is going on', () => {
    render()
    act(() => bridge.events.emit('encounter', { mentorIds: ['munger', 'buffett'] }))
    act(() => bridge.events.emit('encounter', { mentorIds: ['buffett', 'munger'] }))

    expect(commands.map((c) => c.name)).toEqual(['visit', 'greet'])
  })

  it('tries again soon after a meeting that came to nothing', async () => {
    render()
    act(() => bridge.events.emit('encounter', { mentorIds: ['munger', 'buffett'] }))
    act(() => bridge.events.emit('visitFailed', { visitorId: 'munger', hostId: 'buffett' }))
    await wait(ENCOUNTER_RETRY_MS)

    act(() => bridge.events.emit('encounter', { mentorIds: ['buffett', 'munger'] }))

    expect(commands.filter((c) => c.name === 'visit')).toHaveLength(2)
  })

  it('ignores encounters while the square is not being played', () => {
    render(false)
    act(() => bridge.events.emit('encounter', { mentorIds: ['munger', 'buffett'] }))
    expect(commands).toEqual([])
  })
})
