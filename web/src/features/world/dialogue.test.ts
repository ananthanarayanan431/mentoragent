import { describe, expect, it } from 'vitest'

import type { Message } from '@/lib/types'
import { currentExchange, nextRevealed } from './dialogue'

const user = (id: string, content = id): Message => ({ id, role: 'user', content })
const mentor = (id: string, content = id, streaming = false): Message => ({
  id,
  role: 'mentor',
  content,
  streaming,
})

describe('currentExchange', () => {
  it('is empty before anything was said', () => {
    expect(currentExchange([])).toEqual({ question: null, reply: null })
  })

  it('pairs the newest reply with the question before it', () => {
    const messages = [user('q1'), mentor('a1'), user('q2'), mentor('a2')]
    expect(currentExchange(messages)).toEqual({ question: messages[2], reply: messages[3] })
  })

  it('shows a blank streaming reply while the mentor thinks', () => {
    const thinking = mentor('a2', '', true)
    const messages = [user('q1'), mentor('a1'), user('q2'), thinking]
    expect(currentExchange(messages)).toEqual({ question: messages[2], reply: thinking })
  })

  it('shows a question that has no reply yet on its own', () => {
    const messages = [user('q1'), mentor('a1'), user('q2')]
    expect(currentExchange(messages)).toEqual({ question: messages[2], reply: null })
  })

  it('shows a reply without a question (a greeting or an error)', () => {
    const failed: Message = { id: 'e', role: 'mentor', content: 'Down', failed: true }
    expect(currentExchange([failed])).toEqual({ question: null, reply: failed })
  })
})

describe('nextRevealed', () => {
  it('types one character at a time when close behind', () => {
    expect(nextRevealed(0, 10)).toBe(1)
    expect(nextRevealed(9, 10)).toBe(10)
  })

  it('takes bigger steps when the text has run far ahead', () => {
    expect(nextRevealed(0, 400)).toBe(10)
  })

  it('never passes the end', () => {
    expect(nextRevealed(10, 10)).toBe(10)
    expect(nextRevealed(12, 10)).toBe(10)
  })
})
