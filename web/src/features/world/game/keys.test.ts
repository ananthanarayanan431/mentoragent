import { describe, expect, it } from 'vitest'

import { isForTheGame, oncePerEvent, WORLD_ROOT_ATTRIBUTE } from './keys'

function keyOn(target: EventTarget | null) {
  return { target }
}

describe('isForTheGame', () => {
  it('is true for the page itself and anything inside the game container', () => {
    const root = document.createElement('div')
    root.setAttribute(WORLD_ROOT_ATTRIBUTE, '')
    const canvas = document.createElement('canvas')
    root.append(canvas)
    document.body.append(root)

    expect(isForTheGame(keyOn(window))).toBe(true)
    expect(isForTheGame(keyOn(document))).toBe(true)
    expect(isForTheGame(keyOn(document.body))).toBe(true)
    expect(isForTheGame(keyOn(root))).toBe(true)
    expect(isForTheGame(keyOn(canvas))).toBe(true)
    root.remove()
  })

  it('is false for text boxes, links and buttons outside the game', () => {
    for (const tag of ['textarea', 'input', 'select', 'button', 'a']) {
      const element = document.createElement(tag)
      document.body.append(element)
      expect(isForTheGame(keyOn(element))).toBe(false)
      element.remove()
    }
  })
})

describe('oncePerEvent', () => {
  it('handles each event once, however often it is replayed', () => {
    const handled: string[] = []
    const handler = oncePerEvent((event: { key: string }) => handled.push(event.key))
    const space = { key: ' ' }
    const enter = { key: 'Enter' }

    handler(space)
    handler(enter)
    handler(space) // replayed by a later key event in the same frame
    handler(enter)

    expect(handled).toEqual([' ', 'Enter'])
  })
})
