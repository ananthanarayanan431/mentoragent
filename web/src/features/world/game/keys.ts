/**
 * True when a key event was typing in a text field (the dialogue's text box, the
 * header's controls...). The game must ignore those keys.
 *
 * Phaser queues DOM key events and handles them on its next frame, so checking
 * "is game input enabled?" is not enough: a Space typed into the dialogue can be
 * handled after Escape has closed it and re-enabled input, and would open it
 * again. The event's target says what the key was for, whatever the timing.
 */
export function isTypingIntoField(event: Pick<KeyboardEvent, 'target'>): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/**
 * Wraps a key handler so each native event is handled at most once.
 *
 * Phaser re-processes its whole key queue every time a key event arrives within
 * the same frame, and its duplicate check only compares an event with the one just
 * before it. On a slow frame, the Space that opened a conversation is replayed when
 * Escape is released and, with input enabled again, opens it a second time.
 */
export function oncePerEvent<E extends object>(handler: (event: E) => void): (event: E) => void {
  const seen = new WeakSet<E>()
  return (event) => {
    if (seen.has(event)) return
    seen.add(event)
    handler(event)
  }
}
