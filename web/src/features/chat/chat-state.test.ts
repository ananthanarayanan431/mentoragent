import { describe, expect, it } from 'vitest'

import { chatReducer, initialChatState, parseServerEvent } from './chat-state'
import type { ChatState } from './chat-state'

/** Run a sequence of actions from the initial state. */
function reduce(...actions: Parameters<typeof chatReducer>[1][]): ChatState {
  return actions.reduce(chatReducer, initialChatState)
}

const send = { type: 'send', id: 'u1', content: 'Hello' } as const

describe('chatReducer', () => {
  it('adds the user message and a placeholder for the reply', () => {
    const state = reduce(send)

    expect(state.isStreaming).toBe(true)
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0]).toMatchObject({ role: 'user', content: 'Hello' })
    expect(state.messages[1]).toMatchObject({ role: 'mentor', content: '', streaming: true })
  })

  it('appends chunks to the streaming reply and records the conversation id', () => {
    const state = reduce(
      send,
      { type: 'server', event: { type: 'start', conversation_id: 'c1' } },
      { type: 'server', event: { type: 'chunk', content: 'Hi ' } },
      { type: 'server', event: { type: 'chunk', content: 'there' } },
    )

    expect(state.conversationId).toBe('c1')
    expect(state.messages[1]?.content).toBe('Hi there')
    expect(state.messages[1]?.streaming).toBe(true)
  })

  it('prefers the full response on end, so a dropped chunk cannot leave a hole', () => {
    const state = reduce(
      send,
      { type: 'server', event: { type: 'chunk', content: 'Hi ' } },
      { type: 'server', event: { type: 'end', conversation_id: 'c1', response: 'Hi there!' } },
    )

    expect(state.isStreaming).toBe(false)
    expect(state.messages[1]).toMatchObject({ content: 'Hi there!', streaming: false })
  })

  it('replaces an empty placeholder with the error notice', () => {
    const state = reduce(send, {
      type: 'server',
      event: { type: 'error', detail: 'Mentor not found' },
    })

    expect(state.isStreaming).toBe(false)
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1]).toMatchObject({ content: 'Mentor not found', failed: true })
  })

  it('keeps a partial reply when the error arrives mid-stream', () => {
    const state = reduce(
      send,
      { type: 'server', event: { type: 'chunk', content: 'Half a th' } },
      { type: 'failed', detail: 'The connection dropped.' },
    )

    expect(state.messages).toHaveLength(3)
    expect(state.messages[1]).toMatchObject({ content: 'Half a th', streaming: false })
    expect(state.messages[2]).toMatchObject({ failed: true })
  })

  it('flattens a validation error list into one line', () => {
    const state = reduce(send, {
      type: 'server',
      event: { type: 'error', detail: [{ msg: 'too long' }, { msg: 'not allowed' }] },
    })

    expect(state.messages.at(-1)?.content).toBe('too long; not allowed')
  })

  it('reset clears the conversation', () => {
    expect(reduce(send, { type: 'reset' })).toEqual(initialChatState)
  })
})

describe('chatReducer: the mentor speaks first', () => {
  const open = { type: 'open', id: 'o1' } as const

  it('adds only a placeholder for the mentor, no message from you', () => {
    const state = reduce(open)

    expect(state.isStreaming).toBe(true)
    expect(state.messages).toEqual([{ id: 'o1', role: 'mentor', content: '', streaming: true }])
  })

  it('fills the opener like any reply', () => {
    const state = reduce(
      open,
      { type: 'server', event: { type: 'start', conversation_id: 'c1' } },
      { type: 'server', event: { type: 'chunk', content: 'I hear ' } },
      { type: 'server', event: { type: 'end', conversation_id: 'c1', response: 'I hear you.' } },
    )

    expect(state.isStreaming).toBe(false)
    expect(state.conversationId).toBe('c1')
    expect(state.messages).toEqual([
      { id: 'o1', role: 'mentor', content: 'I hear you.', streaming: false },
    ])
  })

  it('drops the placeholder when the mentor has nothing to say', () => {
    const state = reduce(open, {
      type: 'server',
      event: { type: 'silent', conversation_id: null },
    })

    expect(state).toEqual(initialChatState)
  })

  it('keeps the conversation when silent, and its id when one comes back', () => {
    const before = reduce(send, {
      type: 'server',
      event: { type: 'end', conversation_id: 'c1', response: 'Hi.' },
    })
    const state = [
      { type: 'open', id: 'o2' } as const,
      { type: 'server', event: { type: 'silent', conversation_id: 'c1' } } as const,
    ].reduce(chatReducer, before)

    expect(state.messages).toEqual(before.messages)
    expect(state.conversationId).toBe('c1')
    expect(state.isStreaming).toBe(false)
  })

  it('ignores an opener while a reply is streaming', () => {
    const streaming = reduce(send)
    expect(chatReducer(streaming, open)).toBe(streaming)
  })
})

describe('parseServerEvent', () => {
  it('accepts well-formed events', () => {
    expect(parseServerEvent('{"type":"chunk","content":"x"}')).toEqual({
      type: 'chunk',
      content: 'x',
    })
    expect(parseServerEvent('{"type":"start","conversation_id":"c1"}')).toEqual({
      type: 'start',
      conversation_id: 'c1',
    })
  })

  it('accepts silence, with or without a conversation id', () => {
    expect(parseServerEvent('{"type":"silent","conversation_id":"c1"}')).toEqual({
      type: 'silent',
      conversation_id: 'c1',
    })
    expect(parseServerEvent('{"type":"silent","conversation_id":null}')).toEqual({
      type: 'silent',
      conversation_id: null,
    })
  })

  it('rejects malformed payloads rather than throwing', () => {
    expect(parseServerEvent('not json')).toBeNull()
    expect(parseServerEvent('{"type":"nope"}')).toBeNull()
    // Right type, wrong field type.
    expect(parseServerEvent('{"type":"chunk","content":42}')).toBeNull()
    expect(parseServerEvent(new Blob())).toBeNull()
  })
})
