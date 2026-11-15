import { beforeEach, describe, expect, it } from 'vitest'

import { clearConversation, groupKey, loadConversation, saveConversation } from './storage'
import { initialChatState } from './chat-state'

const MENTOR = 'ada'

beforeEach(() => window.localStorage.clear())

describe('conversation storage', () => {
  it('round-trips messages and the conversation id', () => {
    saveConversation(MENTOR, {
      conversationId: 'c1',
      isStreaming: false,
      messages: [
        { id: 'u1', role: 'user', content: 'Hello' },
        { id: 'm1', role: 'mentor', content: 'Hi there' },
      ],
    })

    const restored = loadConversation(MENTOR)
    expect(restored.conversationId).toBe('c1')
    expect(restored.messages).toHaveLength(2)
    expect(restored.isStreaming).toBe(false)
  })

  it('drops the empty placeholder of a reply that never arrived', () => {
    saveConversation(MENTOR, {
      conversationId: 'c1',
      isStreaming: true,
      messages: [
        { id: 'u1', role: 'user', content: 'Hello' },
        { id: 'm1', role: 'mentor', content: '', streaming: true },
      ],
    })

    expect(loadConversation(MENTOR).messages).toHaveLength(1)
  })

  it('keeps conversations for different mentors apart', () => {
    saveConversation(MENTOR, {
      conversationId: 'c1',
      isStreaming: false,
      messages: [{ id: 'u1', role: 'user', content: 'Hello' }],
    })

    expect(loadConversation('curie')).toEqual(initialChatState)
  })

  it('ignores corrupted stored data', () => {
    window.localStorage.setItem('mentoragent:conversation:ada', '{ not json')
    expect(loadConversation(MENTOR)).toEqual(initialChatState)

    window.localStorage.setItem('mentoragent:conversation:ada', '{"messages":"nope"}')
    expect(loadConversation(MENTOR)).toEqual(initialChatState)
  })

  it('skips entries whose shape does not match', () => {
    window.localStorage.setItem(
      'mentoragent:conversation:ada',
      JSON.stringify({
        conversationId: 'c1',
        messages: [
          { id: 'u1', role: 'alien', content: 'x' },
          { id: 'u2', role: 'user' },
        ],
      }),
    )

    expect(loadConversation(MENTOR).messages).toEqual([])
  })

  it('clears a conversation', () => {
    saveConversation(MENTOR, {
      conversationId: 'c1',
      isStreaming: false,
      messages: [{ id: 'u1', role: 'user', content: 'Hello' }],
    })
    clearConversation(MENTOR)

    expect(loadConversation(MENTOR)).toEqual(initialChatState)
  })

  it('keeps one conversation per pair of mentors, whoever was walked up to', () => {
    expect(groupKey(['buffett', 'munger'])).toBe(groupKey(['munger', 'buffett']))
    expect(groupKey(['buffett', 'munger'])).not.toBe('buffett')
  })

  it('remembers who said what in a group conversation', () => {
    const key = groupKey(['buffett', 'munger'])
    saveConversation(key, {
      conversationId: 'c1',
      isStreaming: false,
      messages: [
        { id: 'u1', role: 'user', content: 'Hi' },
        { id: 'm1', role: 'mentor', content: 'Index funds.', mentorId: 'buffett' },
      ],
    })

    expect(loadConversation(key).messages[1]).toEqual({
      id: 'm1',
      role: 'mentor',
      content: 'Index funds.',
      mentorId: 'buffett',
    })
  })
})
