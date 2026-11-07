import { describe, expect, it } from 'vitest'

import { isTypingIntoField, oncePerEvent } from './keys'

function keyOn(target: EventTarget | null) {
  return { target }
}

describe('isTypingIntoField', () => {
  it('is true for text boxes, inputs, selects and editable elements', () => {
    expect(isTypingIntoField(keyOn(document.createElement('textarea')))).toBe(true)
    expect(isTypingIntoField(keyOn(document.createElement('input')))).toBe(true)
    expect(isTypingIntoField(keyOn(document.createElement('select')))).toBe(true)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    // jsdom does not compute isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isTypingIntoField(keyOn(editable))).toBe(true)
  })

  it('is false for the page, the game and buttons', () => {
    expect(isTypingIntoField(keyOn(document.body))).toBe(false)
    expect(isTypingIntoField(keyOn(document.createElement('canvas')))).toBe(false)
    expect(isTypingIntoField(keyOn(document.createElement('button')))).toBe(false)
    expect(isTypingIntoField(keyOn(window))).toBe(false)
    expect(isTypingIntoField(keyOn(null))).toBe(false)
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
