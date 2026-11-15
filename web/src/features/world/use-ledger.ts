import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, deleteLedgerLine, listLedger } from '@/lib/api'
import type { LedgerLine } from '@/lib/types'

/**
 * How long after a conversation to reload the ledger: the agent notes the advice
 * just after the reply, with one model call, so it lands a moment later.
 */
export const LEDGER_REFRESH_DELAY_MS = 2500

export interface Ledger {
  /** What the mentors have told you, newest first. */
  lines: LedgerLine[]
  /** Why the last change failed; empty when it did not. */
  error: string
  /** Forgets one line: gone at once, put back if the server says no. */
  forget: (id: string) => Promise<void>
  /** Reloads in a moment (after a conversation ends). */
  refreshSoon: () => void
}

/** The advice ledger shared by the quest log and the speech bubbles. */
export function useLedger(): Ledger {
  const [lines, setLines] = useState<LedgerLine[]>([])
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const linesRef = useRef(lines)
  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  const load = useCallback((signal?: AbortSignal) => {
    listLedger(signal)
      .then(setLines)
      .catch(() => {}) // the ledger is extra: without it the square still works
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => {
      controller.abort()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [load])

  const refreshSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => load(), LEDGER_REFRESH_DELAY_MS)
  }, [load])

  const forget = useCallback(async (id: string) => {
    const before = linesRef.current
    setError('')
    setLines(before.filter((line) => line.id !== id))
    try {
      await deleteLedgerLine(id)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) return // already gone
      setLines(before)
      setError(cause instanceof ApiError ? cause.message : 'The advice could not be forgotten.')
    }
  }, [])

  return { lines, error, forget, refreshSoon }
}
