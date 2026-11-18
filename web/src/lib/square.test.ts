import { beforeEach, describe, expect, it } from 'vitest'

import { wsUrl } from './config'
import { currentSquareId, DEFAULT_SQUARE_ID, setCurrentSquareId, squareKey } from './square'

beforeEach(() => window.localStorage.clear())

describe('the current square', () => {
  it('is the first square until you pick another, and is remembered', () => {
    expect(currentSquareId()).toBe(DEFAULT_SQUARE_ID)
    setCurrentSquareId('cricket')
    expect(currentSquareId()).toBe('cricket')
    expect(window.localStorage.getItem('mentoragent:square')).toBe('cricket')
  })

  it('keeps storage keys of the first square as they were, so old chats are found', () => {
    expect(squareKey('mentoragent:conversation:ada', 'main')).toBe('mentoragent:conversation:ada')
  })

  it('gives every other square its own storage keys', () => {
    expect(squareKey('k', 'cricket')).toBe('k@cricket')
    expect(squareKey('k', 'cricket')).not.toBe(squareKey('k', 'chess'))
  })

  it('goes on the chat socket', () => {
    setCurrentSquareId('cricket')
    expect(new URL(wsUrl('/api/v1/ws/chat')).searchParams.get('square_id')).toBe('cricket')
  })
})
