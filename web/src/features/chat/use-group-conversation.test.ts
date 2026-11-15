import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientMessage, ServerEvent } from '@/lib/types'
import { groupKey, loadConversation } from './storage'
import { useGroupConversation } from './use-group-conversation'

const socket = vi.hoisted(() => ({
  sent: [] as ClientMessage[],
  onEvent: (() => {}) as (event: ServerEvent) => void,
}))
vi.mock('./use-chat-socket', () => ({
  useChatSocket: ({ onEvent }: { onEvent: (event: ServerEvent) => void }) => {
    socket.onEvent = onEvent
    return {
      status: 'open',
      reconnect: () => {},
      send: (request: ClientMessage) => {
        socket.sent.push(request)
        return true
      },
    }
  },
}))

const api = vi.hoisted(() => ({
  deleteConversation: vi.fn<(m: string, c: string) => Promise<void>>(),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  deleteConversation: api.deleteConversation,
}))

const PAIR: [string, string] = ['buffett', 'munger']

function answer(conversationId = 'c1') {
  act(() => {
    for (const [mentorId, text] of [
      ['buffett', 'Index funds.'],
      ['munger', 'No fees.'],
    ] as const) {
      socket.onEvent({ type: 'start', conversation_id: conversationId, mentor_id: mentorId })
      socket.onEvent({
        type: 'end',
        conversation_id: conversationId,
        response: text,
        mentor_id: mentorId,
      })
    }
    socket.onEvent({ type: 'turn_end', conversation_id: conversationId })
  })
}

beforeEach(() => {
  window.localStorage.clear()
  socket.sent = []
  api.deleteConversation.mockResolvedValue()
})

describe('useGroupConversation', () => {
  it('sends to both mentors, with the chat you joined on the first turn only', () => {
    const { result } = renderHook(() => useGroupConversation(PAIR, 'amb1'))

    act(() => {
      result.current.send('How should I invest?')
    })
    answer()
    act(() => {
      result.current.send('And then?')
    })

    expect(socket.sent).toEqual([
      { mentor_ids: PAIR, message: 'How should I invest?', ambient_id: 'amb1' },
      { mentor_ids: PAIR, message: 'And then?', conversation_id: 'c1' },
    ])
  })

  it('keeps both replies, each under its speaker, and saves them for the pair', () => {
    const { result } = renderHook(() => useGroupConversation(PAIR, null))
    act(() => {
      result.current.send('How should I invest?')
    })
    answer()

    expect(result.current.state.messages.map((m) => m.mentorId)).toEqual([
      undefined,
      'buffett',
      'munger',
    ])
    expect(loadConversation(groupKey(['munger', 'buffett'])).messages).toHaveLength(3)
  })

  it('will not send while the mentors are answering', () => {
    const { result } = renderHook(() => useGroupConversation(PAIR, null))
    act(() => {
      result.current.send('First')
    })
    let accepted = true
    act(() => {
      accepted = result.current.send('Second')
    })
    expect(accepted).toBe(false)
    expect(socket.sent).toHaveLength(1)
  })

  it('starts over by forgetting both mentors threads', () => {
    const { result } = renderHook(() => useGroupConversation(PAIR, null))
    act(() => {
      result.current.send('Hi')
    })
    answer('c9')

    act(() => result.current.startNewChat())

    expect(result.current.state.messages).toEqual([])
    expect(api.deleteConversation).toHaveBeenCalledWith('buffett', 'c9')
    expect(api.deleteConversation).toHaveBeenCalledWith('munger', 'c9')
  })
})
