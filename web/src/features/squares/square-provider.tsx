import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { createSquare, deleteSquare, listSquares, updateSquare } from '@/lib/api'
import { currentSquareId, setCurrentSquareId } from '@/lib/square'
import type { Square } from '@/lib/types'
import { SquareContext } from './use-squares'
import type { SquareContextValue } from './use-squares'

/**
 * Which square the app is in, and the list to switch between. Wrap the pages in a
 * keyed element (`key={currentId}`) so switching remounts them for the new square.
 */
export function SquareProvider({ children }: { children: ReactNode }) {
  const [squares, setSquares] = useState<Square[]>([])
  const [currentId, setCurrentId] = useState(currentSquareId)

  const switchTo = useCallback((squareId: string) => {
    setCurrentSquareId(squareId)
    setCurrentId(squareId)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    listSquares(controller.signal)
      .then((loaded) => {
        setSquares(loaded)
        // The remembered square was deleted (in another tab, say): go to the first.
        const first = loaded[0]
        if (first && !loaded.some((s) => s.id === currentSquareId())) switchTo(first.id)
      })
      .catch(() => {}) // agent unreachable: the pages show their own errors
    return () => controller.abort()
  }, [switchTo])

  const create = useCallback(
    async (name: string) => {
      const square = await createSquare({ name })
      setSquares((list) => [...list, square])
      switchTo(square.id)
      return square
    },
    [switchTo],
  )

  const rename = useCallback(
    async (name: string) => {
      const renamed = await updateSquare(currentId, { name })
      setSquares((list) => list.map((s) => (s.id === renamed.id ? renamed : s)))
    },
    [currentId],
  )

  const removeCurrent = useCallback(async () => {
    await deleteSquare(currentId)
    const left = squares.filter((s) => s.id !== currentId)
    setSquares(left)
    if (left[0]) switchTo(left[0].id)
  }, [currentId, squares, switchTo])

  const value = useMemo<SquareContextValue>(
    () => ({
      squares,
      currentId,
      current: squares.find((s) => s.id === currentId) ?? null,
      switchTo,
      create,
      rename,
      removeCurrent,
    }),
    [squares, currentId, switchTo, create, rename, removeCurrent],
  )

  return <SquareContext value={value}>{children}</SquareContext>
}
