import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import { useSquares } from '@/features/squares/use-squares'
import { ApiError } from '@/lib/api'
import { SectionHeading } from './section'

/** Longest square name the agent accepts. */
const NAME_MAX_CHARS = 60

/**
 * "This square": rename the square you are in, or delete it with everything said in
 * it. Mentors are never deleted with a square; they stay in your mentors.
 */
export function SquarePanel() {
  const { squares, current, rename, removeCurrent } = useSquares()
  // null until edited: the field shows the square's name as it is.
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const headingId = useId()
  const nameId = useId()

  if (!current) return null

  const name = draft ?? current.name
  const trimmed = name.trim()
  const changed = trimmed.length > 0 && trimmed !== current.name
  const onlyOne = squares.length <= 1

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!changed) return
    setSaving(true)
    setError('')
    try {
      await rename(trimmed)
      setDraft(null)
      setNotice('Renamed.')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The square could not be renamed.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    setError('')
    try {
      await removeCurrent() // switches square, which remounts this page
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The square could not be deleted.')
      setSaving(false)
      setConfirming(false)
    }
  }

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <SectionHeading id={headingId} title="This square" />
      <form onSubmit={(e) => void save(e)} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={nameId} className="text-sm font-medium">
            Name
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => {
              setDraft(e.target.value)
              setNotice('')
            }}
            maxLength={NAME_MAX_CHARS}
            className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!changed || saving}
          className="rounded-lg bg-accent px-4 py-2 font-pixel text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          Rename
        </button>
      </form>

      <div className="rounded-lg border border-line p-4 text-sm">
        <p className="text-muted">
          Deleting a square forgets its goal, the advice given in it and its chats. The mentors stay
          in your mentors and in their other squares.
        </p>
        {onlyOne ? (
          <p className="mt-3 text-muted">This is your only square, so it cannot be deleted.</p>
        ) : confirming ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-medium">Delete “{current.name}” for good?</span>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={saving}
              className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-on-accent disabled:opacity-50"
            >
              Delete square
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={saving}
              className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-raised"
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm text-danger hover:bg-raised"
          >
            Delete this square…
          </button>
        )}
      </div>

      <p role="status" className="text-sm text-muted">
        {notice}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
