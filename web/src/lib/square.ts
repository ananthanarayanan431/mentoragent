/**
 * Which mentor square the app is in. Every API request and the chat socket carry it,
 * and browser storage (saved chats, friendship) is kept per square, so nothing said
 * in one square shows up in another.
 *
 * Remembered per browser; every storage access is wrapped, so without storage the
 * choice lasts for the visit.
 */

/** The first square: where everything from before squares existed lives. */
export const DEFAULT_SQUARE_ID = 'main'

const KEY = 'mentoragent:square'

/** Used only when storage is unavailable, so a switch still lasts for the visit. */
let fallback = DEFAULT_SQUARE_ID

export function currentSquareId(): string {
  try {
    return window.localStorage.getItem(KEY) || DEFAULT_SQUARE_ID
  } catch {
    return fallback
  }
}

export function setCurrentSquareId(squareId: string): void {
  fallback = squareId
  try {
    window.localStorage.setItem(KEY, squareId)
  } catch {
    // Storage unavailable: the fallback keeps the choice for this visit.
  }
}

/**
 * A storage key for the current square. The first square keeps the key as it was,
 * so chats and friendship saved before squares existed are still found.
 */
export function squareKey(key: string, squareId = currentSquareId()): string {
  return squareId === DEFAULT_SQUARE_ID ? key : `${key}@${squareId}`
}
