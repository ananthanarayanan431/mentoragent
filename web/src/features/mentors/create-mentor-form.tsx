import { X } from 'lucide-react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import { buildMentorCreate, EMPTY_FIELDS } from './create-mentor'
import type { CreateMentorFields } from './create-mentor'
import { ApiError, createMentor } from '@/lib/api'
import type { Mentor } from '@/lib/types'

interface Props {
  onCreated: (mentor: Mentor) => void
  onCancel: () => void
}

const LABEL = 'text-xs font-semibold uppercase tracking-wider text-faint'
const HINT = 'font-normal normal-case'
const FIELD =
  'w-full rounded-lg border border-line bg-canvas px-3 py-2 outline-none focus:border-accent'

/** Create a mentor from a name plus the links and text their memory is built from. */
export function CreateMentorForm({ onCreated, onCancel }: Props) {
  const [fields, setFields] = useState<CreateMentorFields>(EMPTY_FIELDS)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const headingId = useId()

  const set = <K extends keyof CreateMentorFields>(key: K, value: CreateMentorFields[K]) =>
    setFields((current) => ({ ...current, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const built = buildMentorCreate(fields)
    if ('error' in built) {
      setError(built.error)
      return
    }
    setError('')
    setBusy(true)
    try {
      onCreated(await createMentor(built.body))
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The mentor could not be created.')
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-lg font-semibold">
            Create your own mentor
          </h2>
          <p className="mt-1 text-sm text-muted">
            Start with a name and anything you have: talks, articles, posts. We search the web for
            more of their work, then build the mentor from all of it.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="rounded-lg p-1.5 text-muted hover:bg-raised"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4 text-sm" noValidate>
        <label className="block space-y-1">
          <span className={LABEL}>Name</span>
          <input
            required
            maxLength={120}
            value={fields.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="e.g. Morgan Housel"
            className={FIELD}
          />
        </label>

        {(
          [
            ['youtube', 'YouTube videos', 'https://www.youtube.com/watch?v=…'],
            ['websites', 'Websites and articles', 'https://their-blog.com/about'],
            ['pdfs', 'PDFs', 'https://…/essay.pdf'],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key} className="block space-y-1">
            <span className={LABEL}>
              {label} <span className={HINT}>(https, one per line)</span>
            </span>
            <textarea
              rows={2}
              value={fields[key]}
              onChange={(event) => set(key, event.target.value)}
              placeholder={placeholder}
              className={`${FIELD} font-mono text-xs`}
            />
          </label>
        ))}

        <label className="block space-y-1">
          <span className={LABEL}>
            Posts and other text{' '}
            <span className={HINT}>(LinkedIn posts, newsletters; separate posts with ---)</span>
          </span>
          <textarea
            rows={5}
            value={fields.notes}
            onChange={(event) => set('notes', event.target.value)}
            placeholder={'Paste a LinkedIn post here\n---\nAnd another one here'}
            className={FIELD}
          />
        </label>

        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={fields.research}
            onChange={(event) => set('research', event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Research them on the web: find more of their talks and writing, and work out how they
            think and talk (takes a few minutes, uses paid web searches)
          </span>
        </label>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={fields.wikipedia}
            onChange={(event) => set('wikipedia', event.target.checked)}
          />
          They&rsquo;re well known: also read their Wikipedia page
        </label>

        <details className="rounded-lg border border-line px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted">
            Describe them yourself (optional, filled in from the research if left blank)
          </summary>
          <div className="mt-3 space-y-3">
            {(
              [
                ['expertise', 'Expertise', 'What they know best', 2],
                ['perspective', 'Perspective', 'The beliefs they argue from', 3],
                ['style', 'Talking style', 'How they talk and explain', 2],
              ] as const
            ).map(([key, label, placeholder, rows]) => (
              <label key={key} className="block space-y-1">
                <span className={LABEL}>{label}</span>
                <textarea
                  rows={rows}
                  maxLength={600}
                  value={fields[key]}
                  onChange={(event) => set(key, event.target.value)}
                  placeholder={placeholder}
                  className={FIELD}
                />
              </label>
            ))}
          </div>
        </details>

        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create mentor'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-raised"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}
