/** Marks the element that holds the game; keys aimed inside it are game keys. */
export const WORLD_ROOT_ATTRIBUTE = 'data-world-root'

/**
 * True when a key event is for the game: focus is on the page itself or inside the
 * game's container. Keys aimed at anything else (the dialogue's text box, a focused
 * link or button in the header or a menu) belong to that element, and the game
 * must neither act on them nor cancel them.
 *
 * Phaser listens on `window` and handles its queued key events on the next frame,
 * so "is game input enabled?" alone is not enough: the target says what the key was
 * for, whatever the timing.
 */
export function isForTheGame(event: Pick<KeyboardEvent, 'target'>): boolean {
  const target = event.target
  if (!(target instanceof Element)) return true // window or document
  if (target === document.body || target === document.documentElement) return true
  return target.closest(`[${WORLD_ROOT_ATTRIBUTE}]`) !== null
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
