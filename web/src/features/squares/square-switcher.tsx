import { Check, ChevronDown, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { ApiError } from '@/lib/api'
import { useSquares } from './use-squares'

/**
 * Pick the square you are in, or make a new one. Each square has its own mentors, goal
 * and conversations; switching reloads every page for the square you picked.
 */
export function SquareSwitcher() {
  const { squares, currentId, current, switchTo, create } = useSquares()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const nameId = useId()

  // Close on a click outside or on Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function pick(squareId: string) {
    setOpen(false)
    if (squareId !== currentId) switchTo(squareId)
  }

  async function make(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setError('')
    setCreating(true)
    try {
      await create(trimmed)
      setName('')
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The square could not be made.')
    } finally {
      setCreating(false)
    }
  }

  // Nothing to switch between until the list loads (or if the agent is down).
  if (!squares.length) return null

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Square: ${current?.name ?? 'choose a square'}`}
        className="inline-flex max-w-[9rem] items-center gap-1 rounded-md border border-line px-2 py-1 font-pixel text-sm hover:bg-raised sm:max-w-[14rem]"
      >
        <span className="truncate">{current?.name ?? 'Square'}</span>
        <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-lg"
        >
          <p className="px-2 pt-1 pb-2 text-xs text-muted">
            Each square has its own mentors, goal and conversations.
          </p>
          <ul aria-label="Squares" className="space-y-0.5">
            {squares.map((square) => (
              <li key={square.id}>
                <button
                  type="button"
                  onClick={() => pick(square.id)}
                  aria-current={square.id === currentId ? 'true' : undefined}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-raised"
                >
                  <Check
                    size={14}
                    aria-hidden="true"
                    className={square.id === currentId ? 'text-accent' : 'invisible'}
                  />
                  <span className="min-w-0 flex-1 truncate">{square.name}</span>
                  <span className="text-xs text-muted">{square.mentor_ids.length}</span>
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={(e) => void make(e)} className="mt-2 border-t border-line pt-2">
            <label htmlFor={nameId} className="px-2 text-xs font-medium text-muted">
              New square
            </label>
            <div className="mt-1 flex gap-1.5 px-1">
              <input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="e.g. Cricket"
                className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1 text-sm"
              />
              <button
                type="submit"
                disabled={creating || !name.trim()}
                aria-label="Make square"
                className="inline-flex items-center rounded-md bg-accent px-2 text-on-accent hover:bg-accent-hover disabled:opacity-50"
              >
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-1 px-2 text-xs text-danger">
                {error}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
