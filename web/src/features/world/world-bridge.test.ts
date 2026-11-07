import { describe, expect, it, vi } from 'vitest'

import { createWorldBridge } from './world-bridge'

describe('world bridge', () => {
  it('delivers events to every listener, typed by name', () => {
    const bridge = createWorldBridge()
    const first = vi.fn<(payload: { mentorId: string }) => void>()
    const second = vi.fn<(payload: { mentorId: string }) => void>()
    bridge.events.on('talk', first)
    bridge.events.on('talk', second)

    bridge.events.emit('talk', { mentorId: 'ada' })

    expect(first).toHaveBeenCalledWith({ mentorId: 'ada' })
    expect(second).toHaveBeenCalledWith({ mentorId: 'ada' })
  })

  it('stops delivering after unsubscribe, and keeps the two directions apart', () => {
    const bridge = createWorldBridge()
    const listener = vi.fn<(payload: { enabled: boolean }) => void>()
    const off = bridge.commands.on('input', listener)

    bridge.commands.emit('input', { enabled: false })
    off()
    bridge.commands.emit('input', { enabled: true })
    bridge.events.emit('nearby', { mentorId: null })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ enabled: false })
  })

  it('clear removes every listener', () => {
    const bridge = createWorldBridge()
    const listener = vi.fn<() => void>()
    bridge.events.on('pause', listener)
    bridge.events.clear()
    bridge.events.emit('pause', {})
    expect(listener).not.toHaveBeenCalled()
  })
})
