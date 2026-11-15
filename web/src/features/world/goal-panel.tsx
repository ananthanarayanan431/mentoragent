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
  /** True while the player is typing, so the world can stop listening to keys. */
  onEditingChange: (editing: boolean) => void
}

/** "Your goal" at the top of the quest log: the one thing every mentor helps with. */
export function GoalPanel({ goal, onSave, onEditingChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onEditingChange(editing)
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
      <form onSubmit={save} className="space-y-1.5 border-b border-line pb-3">
        <label
          htmlFor="goal-input"
          className="font-mono text-[11px] font-bold uppercase text-muted"
        >
          Your goal
        </label>
        <input
          id="goal-input"
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="What do you want the mentors to help you with?"
          aria-invalid={tooLong}
          aria-describedby="goal-count"
          className={`w-full rounded-md border bg-canvas px-2 py-1.5 text-sm outline-none focus:border-accent ${
            tooLong ? 'border-danger' : 'border-line'
          }`}
        />
        <div className="flex items-center gap-2">
          <span
            id="goal-count"
            className={`flex-1 font-mono text-[11px] ${tooLong ? 'text-danger' : 'text-faint'}`}
          >
            {trimmed.length}/{GOAL_MAX_CHARS}
          </span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md px-2 py-1 text-xs text-muted hover:bg-raised"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-on-accent hover:bg-accent-hover disabled:opacity-40"
          >
            Save
          </button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </form>
    )
  }

  if (!goal) {
    return (
      <div className="border-b border-line pb-3">
        <button
          type="button"
          onClick={startEditing}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-line-strong px-2 py-1.5 text-left text-sm text-muted hover:bg-raised"
        >
          <Target size={14} aria-hidden="true" className="shrink-0 text-accent" />
          Set your goal
        </button>
      </div>
    )
  }

  return (
    <div className="border-b border-line pb-3">
      <div className="flex items-start gap-2">
        <Target size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-bold uppercase text-muted">Your goal</p>
          <p className="break-words text-sm">{goal}</p>
        </div>
        <button
          type="button"
          onClick={startEditing}
          aria-label="Edit your goal"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-raised"
        >
          <Pencil size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
