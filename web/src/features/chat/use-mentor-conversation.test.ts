import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatRequest, ServerEvent } from '@/lib/types'
import { useMentorConversation } from './use-mentor-conversation'

// The socket is replaced by a controllable stand-in: tests decide whether a send
// goes through, and push server events by hand.
const socket = vi.hoisted(() => ({
  accept: true,
  sent: [] as ChatRequest[],
  onEvent: null as ((event: ServerEvent) => void) | null,
}))

vi.mock('./use-chat-socket', () => ({
  useChatSocket: ({ onEvent }: { onEvent: (event: ServerEvent) => void }) => {
    socket.onEvent = onEvent
    return {
      status: 'open',
      reconnect: () => {},
      send: (request: ChatRequest) => {
        if (!socket.accept) return false
        socket.sent.push(request)
        return true
      },
    }
  },
}))

const api = vi.hoisted(() => ({
  sendChat: vi.fn<(request: ChatRequest) => Promise<unknown>>(),
  deleteConversation: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}))

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  sendChat: api.sendChat,
  deleteConversation: api.deleteConversation,
}))

function serverSends(event: ServerEvent) {
  act(() => socket.onEvent?.(event))
}

beforeEach(() => {
  window.localStorage.clear()
  socket.accept = true
  socket.sent = []
  api.sendChat.mockReset()
})

afterEach(() => vi.clearAllMocks())

describe('useMentorConversation', () => {
  it('streams a reply over the socket and remembers the conversation id', () => {
    const { result } = renderHook(() => useMentorConversation('ada'))

    let accepted = false
    act(() => {
      accepted = result.current.send('  Hello  ')
    })
    expect(accepted).toBe(true)
    expect(socket.sent).toEqual([{ mentor_id: 'ada', message: 'Hello' }])

    serverSends({ type: 'start', conversation_id: 'c1' })
    serverSends({ type: 'chunk', content: 'Hi ' })
    serverSends({ type: 'chunk', content: 'there' })
    expect(result.current.state.messages.at(-1)?.content).toBe('Hi there')

    serverSends({ type: 'end', conversation_id: 'c1', response: 'Hi there' })
    expect(result.current.state.isStreaming).toBe(false)

    act(() => {
      result.current.send('Again')
    })
    expect(socket.sent.at(-1)).toEqual({
      mentor_id: 'ada',
      message: 'Again',
      conversation_id: 'c1',
    })
  })

  it('refuses blank messages and messages while a reply is streaming', () => {
    const { result } = renderHook(() => useMentorConversation('ada'))

    expect(result.current.send('   ')).toBe(false)
    act(() => {
      result.current.send('First')
    })
    expect(result.current.send('Second')).toBe(false)
    expect(socket.sent).toHaveLength(1)
  })

  it('falls back to the HTTP endpoint when the socket is unavailable', async () => {
    socket.accept = false
    api.sendChat.mockResolvedValue({ mentor_id: 'ada', conversation_id: 'c9', response: 'By HTTP' })
    const { result } = renderHook(() => useMentorConversation('ada'))

    act(() => {
      result.current.send('Hello')
    })

    await waitFor(() => expect(result.current.state.isStreaming).toBe(false))
    expect(api.sendChat).toHaveBeenCalledWith({ mentor_id: 'ada', message: 'Hello' })
    expect(result.current.state.messages.at(-1)?.content).toBe('By HTTP')
    expect(result.current.state.conversationId).toBe('c9')
  })

  it('restores the conversation after a remount, per mentor', () => {
    const first = renderHook(() => useMentorConversation('ada'))
    act(() => {
      first.result.current.send('Remember me')
    })
    serverSends({ type: 'end', conversation_id: 'c1', response: 'I will' })
    first.unmount()

    const again = renderHook(() => useMentorConversation('ada'))
    expect(again.result.current.state.messages.map((m) => m.content)).toEqual([
      'Remember me',
      'I will',
    ])
    expect(renderHook(() => useMentorConversation('bob')).result.current.state.messages).toEqual([])
  })

  it('starts a new chat by clearing local state and the server conversation', () => {
    const { result } = renderHook(() => useMentorConversation('ada'))
    act(() => {
      result.current.send('Hello')
    })
    serverSends({ type: 'end', conversation_id: 'c1', response: 'Hi' })

    act(() => result.current.startNewChat())

    expect(result.current.state.messages).toEqual([])
    expect(api.deleteConversation).toHaveBeenCalledWith('ada', 'c1')
  })
})
