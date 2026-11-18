import { Pencil, Target } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

import { ApiError } from '@/lib/api'
import { GOAL_MAX_CHARS } from '@/lib/config'

interface Props {
  /** The goal every mentor knows; null before one is set. */
  goal: string | null
  /** Saves the goal; rejects with an `ApiError` when it could not be saved. */
  onSave: (goal: string) => Promise<void>
  /** True while the player is typing, so a game behind it can stop listening to keys. */
  onEditingChange?: (editing: boolean) => void
}

/** "Your goal" in settings, drawn like a quest banner: the one thing every mentor helps with. */
export function GoalPanel({ goal, onSave, onEditingChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onEditingChange?.(editing)
    if (editing) inputRef.current?.focus()
  }, [editing, onEditingChange])

  const trimmed = draft.trim()
  const tooLong = trimmed.length > GOAL_MAX_CHARS
  const canSave = trimmed.length > 0 && !tooLong && !saving

  function startEditing() {
    setDraft(goal ?? '')
    setError('')
    setEditing(true)
  }

  async function save(event?: FormEvent) {
    event?.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The goal could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Keys typed here belong to the box, never to the game behind it.
    event.stopPropagation()
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="rpg-frame space-y-3 p-5">
        <label htmlFor="goal-input" className={LABEL}>
          Your goal
        </label>
        <div className="rpg-inset px-3 py-2">
          <input
            id="goal-input"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="What do you want the mentors to help you with?"
            aria-invalid={tooLong}
            aria-describedby="goal-count"
            className="w-full bg-transparent text-base text-ink outline-none placeholder:text-faint"
          />
        </div>
        <div className="flex items-center gap-2">
          <span
            id="goal-count"
            className={`flex-1 font-pixel text-xs ${tooLong ? 'text-danger' : 'text-muted'}`}
          >
            {trimmed.length}/{GOAL_MAX_CHARS}
          </span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-8 px-3 font-pixel text-sm text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button type="submit" disabled={!canSave} className={PRIMARY}>
            Save
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    )
  }

  if (!goal) {
    return (
      <div className="rpg-frame flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <GoalIcon />
        <div className="min-w-0 flex-1">
          <p className={LABEL}>No goal yet</p>
          <p className="mt-1 text-sm text-muted">
            Name one thing you want help with. Every mentor steers their advice toward it.
          </p>
        </div>
        <button type="button" onClick={startEditing} className={PRIMARY}>
          Set your goal
        </button>
      </div>
    )
  }

  return (
    <div className="rpg-frame flex items-start gap-4 p-5">
      <GoalIcon />
      <div className="min-w-0 flex-1">
        <p className={LABEL}>Your goal</p>
        <p className="mt-1 text-lg leading-snug font-medium break-words text-ink">{goal}</p>
        <p className="mt-1 text-xs text-muted">Every mentor knows this and steers toward it.</p>
      </div>
      <button
        type="button"
        onClick={startEditing}
        aria-label="Edit your goal"
        className="rpg-plate inline-flex h-8 shrink-0 items-center gap-1.5 bg-scroll px-2.5 font-pixel text-sm text-ink hover:bg-scroll-deep"
      >
        <Pencil size={13} aria-hidden="true" />
        <span className="hidden sm:inline">Edit</span>
      </button>
    </div>
  )
}

const LABEL = 'font-pixel text-xs font-semibold tracking-wider text-accent uppercase'
const PRIMARY =
  'rpg-plate inline-flex h-8 shrink-0 items-center justify-center bg-accent px-3 font-pixel text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-40'

function GoalIcon() {
  return (
    <span
      aria-hidden="true"
      className="rpg-inset grid size-12 shrink-0 place-items-center text-accent"
    >
      <Target size={24} />
    </span>
  )
}
