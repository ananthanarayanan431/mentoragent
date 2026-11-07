import { useState } from 'react'

/**
 * Whether `query` matches, read once on mount (layout choices, not live updates).
 * Wrapped: matchMedia is missing in some environments, and then this is false.
 */
export function useMediaQuery(query: string): boolean {
  const [matches] = useState(() => {
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  })
  return matches
}
