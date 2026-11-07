import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  hasMet,
  LEVEL_THRESHOLDS,
  levelFor,
  loadFriendship,
  MAX_LEVEL,
  recordMessage,
  resetFriendship,
  type Friendship,
} from './progress'

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

function send(friendship: Friendship, mentorId: string, times: number) {
  let state = friendship
  const levelUps: number[] = []
  for (let i = 0; i < times; i++) {
    const result = recordMessage(state, mentorId)
    state = result.friendship
    if (result.levelUp) levelUps.push(result.levelUp.level)
  }
  return { state, levelUps }
}

describe('levelFor', () => {
  it('starts as a stranger and levels up at each threshold', () => {
    expect(levelFor(0)).toMatchObject({ level: 0, name: 'Stranger', toNext: 1, progress: 0 })
    expect(levelFor(1)).toMatchObject({ level: 1, name: 'Acquaintance', toNext: 2 })
    expect(levelFor(2).progress).toBeCloseTo(0.5)
    expect(levelFor(16)).toMatchObject({
      level: MAX_LEVEL,
      name: 'Protégé',
      toNext: 0,
      progress: 1,
    })
    expect(levelFor(500).level).toBe(MAX_LEVEL)
  })
})

describe('friendship', () => {
  it('counts messages per mentor and reports each level-up exactly once', () => {
    const { state, levelUps } = send({}, 'ada', 16)
    expect(levelUps).toEqual([1, 2, 3, 4, 5])
    expect(state.ada).toBe(16)
    expect(hasMet(state, 'ada')).toBe(true)
    expect(hasMet(state, 'bob')).toBe(false)
    expect(LEVEL_THRESHOLDS.at(-1)).toBe(16)
  })

  it('persists across loads and keeps mentors apart', () => {
    send({}, 'ada', 3)
    const loaded = loadFriendship()
    expect(loaded).toEqual({ ada: 3 })
    expect(send(loaded, 'bob', 1).state).toEqual({ ada: 3, bob: 1 })
  })

  it('migrates the earlier "met" list to level 1', () => {
    window.localStorage.setItem('mentoragent:world:met', JSON.stringify(['ada', 'bob']))
    expect(loadFriendship()).toEqual({ ada: 1, bob: 1 })
  })

  it('returns a new object instead of mutating the old one', () => {
    const before = loadFriendship()
    const { friendship } = recordMessage(before, 'ada')
    expect(before).toEqual({})
    expect(friendship).toEqual({ ada: 1 })
  })

  it('ignores corrupt storage and works without storage', () => {
    window.localStorage.setItem('mentoragent:world:friendship', '{"ada": "lots"}')
    expect(loadFriendship()).toEqual({})
    window.localStorage.setItem('mentoragent:world:friendship', '{not json')
    expect(loadFriendship()).toEqual({})

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(recordMessage({}, 'ada').friendship).toEqual({ ada: 1 })
  })

  it('reset forgets everything, including the old format', () => {
    send({}, 'ada', 2)
    window.localStorage.setItem('mentoragent:world:met', '["bob"]')
    expect(resetFriendship()).toEqual({})
    expect(loadFriendship()).toEqual({})
  })
})
