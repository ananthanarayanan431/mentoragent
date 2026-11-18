import { createContext, useContext } from 'react'

import type { Square } from '@/lib/types'

export interface SquareContextValue {
  /** Every square, oldest first; empty until loaded (or if the agent is unreachable). */
  squares: Square[]
  /** The square the app is in. */
  currentId: string
  /** The current square, once the list has loaded. */
  current: Square | null
  /** Enter another square: every page reloads for it. */
  switchTo: (squareId: string) => void
  /** Make a square and enter it. Rejects with an `ApiError` on failure. */
  create: (name: string) => Promise<Square>
  /** Rename the current square. Rejects with an `ApiError` on failure. */
  rename: (name: string) => Promise<void>
  /** Delete the current square and enter the oldest one left. Rejects on failure. */
  removeCurrent: () => Promise<void>
}

export const SquareContext = createContext<SquareContextValue | null>(null)

/** The square the app is in, and the list to switch between (inside a SquareProvider). */
export function useSquares(): SquareContextValue {
  const value = useContext(SquareContext)
  if (!value) throw new Error('useSquares must be used inside a SquareProvider')
  return value
}
