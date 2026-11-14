import { Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'

import {
  ApiError,
  getMentorSources,
  rebuildMentorMemory,
  removeMentor,
  updateMentor,
} from '@/lib/api'
import type { Mentor, MentorSources, MentorUpdate } from '@/lib/types'

interface Props {
  mentor: Mentor
  /** Called with the mentor as the API returns it after a save or a rebuild. */
  onChange: (mentor: Mentor) => void
  /** Called once the mentor has been removed; without it there is no remove button. */
  onRemoved?: () => void
}

const MEMORY_LABELS: Record<string, string> = {
  building: 'Building memory…',
  ready: 'Memory ready',
  failed: 'Memory build failed',
}

/** One URL per line, blank lines dropped. */
function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i])
}

/**
 * Edit a mentor's persona and sources, and rebuild their memory. Mentors are
 * "upgradable": new sources (essays, talks, PDFs) deepen their answers once the
 * memory is rebuilt.
 */
export function MentorEditor({ mentor, onChange, onRemoved }: Props) {
  const [open, setOpen] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [sources, setSources] = useState<MentorSources | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rebuild, setRebuild] = useState(true)
  const [form, setForm] = useState({
    expertise: mentor.expertise,
    perspective: mentor.perspective,
    style: mentor.style,
    websites: '',
    pdfs: '',
    youtube: '',
  })
  const formId = useId()

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    getMentorSources(mentor.id, controller.signal)
      .then((loaded) => {
        setSources(loaded)
        setForm((current) => ({
          ...current,
          websites: (loaded.websites ?? []).join('\n'),
          pdfs: (loaded.pdfs ?? []).join('\n'),
          youtube: (loaded.youtube_videos ?? []).join('\n'),
        }))
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof ApiError ? cause.message : 'Could not load the sources.')
      })
    return () => controller.abort()
  }, [open, mentor.id])

  function changes(): { update: MentorUpdate; sourcesChanged: boolean } {
    const update: MentorUpdate = {}
    for (const field of ['expertise', 'perspective', 'style'] as const) {
      if (form[field].trim() !== mentor[field]) update[field] = form[field].trim()
    }
    const lists = [
      ['websites', lines(form.websites), sources?.websites ?? []],
      ['pdfs', lines(form.pdfs), sources?.pdfs ?? []],
      ['youtube_videos', lines(form.youtube), sources?.youtube_videos ?? []],
    ] as const
    let sourcesChanged = false
    for (const [field, next, before] of lists) {
      if (!sameList(next, before)) {
        update[field] = next
        sourcesChanged = true
      }
    }
    return { update, sourcesChanged }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { update, sourcesChanged } = changes()
      let saved = Object.keys(update).length ? await updateMentor(mentor.id, update) : mentor
      if (sourcesChanged && rebuild) saved = await rebuildMentorMemory(mentor.id)
      onChange(saved)
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The changes could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function rebuildNow() {
    setError('')
    setBusy(true)
    try {
      onChange(await rebuildMentorMemory(mentor.id))
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The memory could not be rebuilt.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setError('')
    setBusy(true)
    try {
      await removeMentor(mentor.id)
      onRemoved?.()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The mentor could not be removed.')
      setConfirmingRemove(false)
      setBusy(false)
    }
  }

  const memoryLabel = mentor.memory ? MEMORY_LABELS[mentor.memory] : null

  return (
    <section aria-label={`Edit ${mentor.name}`} className="space-y-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={formId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-raised"
        >
          <Pencil size={13} aria-hidden="true" />
          {open ? 'Close editor' : 'Edit mentor'}
        </button>
        <button
          type="button"
          onClick={() => void rebuildNow()}
          disabled={busy || mentor.memory === 'building'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-raised disabled:opacity-50"
        >
          <RefreshCw size={13} aria-hidden="true" />
          Rebuild memory
        </button>
        {memoryLabel && (
          <span role="status" className="text-xs text-muted">
            {memoryLabel}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {open && (
        <form id={formId} onSubmit={(event) => void save(event)} className="space-y-3 text-sm">
          {(
            [
              ['expertise', 'Expertise', 2],
              ['perspective', 'Perspective', 4],
              ['style', 'Talking style', 3],
            ] as const
          ).map(([field, label, rows]) => (
            <label key={field} className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-faint">
                {label}
              </span>
              <textarea
                rows={rows}
                required
                maxLength={600}
                value={form[field]}
                onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 outline-none focus:border-accent"
              />
            </label>
          ))}
          {(
            [
              ['websites', 'Websites'],
              ['pdfs', 'PDFs'],
              ['youtube', 'YouTube videos'],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-faint">
                {label} <span className="font-normal normal-case">(https, one per line)</span>
              </span>
              <textarea
                rows={2}
                value={form[field]}
                onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                placeholder="https://"
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs outline-none focus:border-accent"
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={rebuild}
              onChange={(event) => setRebuild(event.target.checked)}
            />
            Rebuild the memory if the sources changed (calls the embeddings API)
          </label>
          <button
            type="submit"
            disabled={busy || !sources}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      )}

      {onRemoved &&
        (confirmingRemove ? (
          <div
            role="group"
            aria-label={`Confirm removing ${mentor.name}`}
            className="space-y-2 rounded-lg border border-danger/40 bg-danger-soft p-3 text-xs"
          >
            <p className="text-danger">
              Remove {mentor.name}? Their memory is deleted too. You can add them back later with
              &ldquo;Add a mentor&rdquo;.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="rounded-lg bg-danger px-3 py-1.5 font-medium text-surface disabled:opacity-50"
              >
                {busy ? 'Removing…' : `Remove ${mentor.name}`}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-raised"
              >
                Keep
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            disabled={busy || mentor.memory === 'building'}
            title={
              mentor.memory === 'building'
                ? 'Wait for the memory build to finish before removing this mentor'
                : undefined
            }
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
          >
            <Trash2 size={13} aria-hidden="true" />
            Remove mentor
          </button>
        ))}
    </section>
  )
}
