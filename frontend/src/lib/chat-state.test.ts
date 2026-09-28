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

  it('rejects malformed payloads rather than throwing', () => {
    expect(parseServerEvent('not json')).toBeNull()
    expect(parseServerEvent('{"type":"nope"}')).toBeNull()
    // Right type, wrong field type.
    expect(parseServerEvent('{"type":"chunk","content":42}')).toBeNull()
    expect(parseServerEvent(new Blob())).toBeNull()
  })
})
