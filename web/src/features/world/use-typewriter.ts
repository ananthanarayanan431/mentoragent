import { useEffect, useState } from 'react'

import { nextRevealed, TYPEWRITER_TICK_MS } from './dialogue'

export interface Typewriter {
  /** The part of the text revealed so far. */
  shown: string
  /** Every character of the current text is on screen. */
  done: boolean
  /** Show the rest at once; text that streams in later appears at once too. */
  skip: () => void
}

interface Progress {
  key: string
  revealed: number
  skipped: boolean
}

/**
 * Reveals `text` a few characters at a time. The text may keep growing (a
 * streamed reply); the reveal follows it. A new `key` starts over, unless
 * `instant` (text already read, or reduced motion), which shows it whole.
 */
export function useTypewriter(text: string, key: string, instant: boolean): Typewriter {
  const [progress, setProgress] = useState<Progress>({
    key,
    revealed: instant ? text.length : 0,
    skipped: instant,
  })

  // A new line: start over. Adjusting state during render avoids a frame of the
  // previous line's text showing under the new key.
  let current = progress
  if (progress.key !== key) {
    current = { key, revealed: instant ? text.length : 0, skipped: instant }
    setProgress(current)
  }

  const revealed = current.skipped ? text.length : Math.min(current.revealed, text.length)
  const done = revealed >= text.length

  useEffect(() => {
    if (done) return
    const timer = window.setInterval(() => {
      setProgress((p) => ({ ...p, revealed: nextRevealed(p.revealed, text.length) }))
    }, TYPEWRITER_TICK_MS)
    return () => window.clearInterval(timer)
  }, [done, text.length])

  return {
    shown: text.slice(0, revealed),
    done,
    skip: () => setProgress((p) => ({ ...p, skipped: true })),
  }
}
