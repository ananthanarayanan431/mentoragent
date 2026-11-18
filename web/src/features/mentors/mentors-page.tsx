import { Library, PenLine, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'

import { CreateMentorForm } from './create-mentor-form'
import { MentorCard } from './mentor-card'
import { PresetPicker } from './preset-picker'
import { EmptyState, ErrorState, MentorCardSkeleton } from '@/components/state-views'
import { clearConversation } from '@/features/chat/storage'
import {
  addRandomMentor,
  ApiError,
  getMentorPool,
  listMentors,
  removeMentor,
  setInSquare,
} from '@/lib/api'
import { API_BASE_URL, MEMORY_POLL_MS } from '@/lib/config'
import type { Mentor } from '@/lib/types'

type Status = 'loading' | 'ready' | 'error'
/** Which panel opens under the buttons: the create form or the preset picker. */
type Panel = 'create' | 'preset' | null

export function MentorsPage() {
  const [mentors, setMentors] = useState<Mentor[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string>('')
  // Bumped by "Try again" to re-run the effect.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listMentors(controller.signal)
      .then((data) => {
        setMentors(data)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof ApiError ? cause.message : 'Could not load the mentors.')
        setStatus('error')
      })

    return () => controller.abort()
  }, [attempt])

  // While any memory is being built, check back now and then, so the "Preparing"
  // tags clear by themselves once the mentors are ready.
  const building = mentors.some((mentor) => mentor.memory === 'building')
  useEffect(() => {
    if (!building) return
    const timer = window.setInterval(() => {
      listMentors()
        .then(setMentors)
        .catch(() => {}) // a missed check is retried on the next tick
    }, MEMORY_POLL_MS)
    return () => window.clearInterval(timer)
  }, [building])

  const [poolLeft, setPoolLeft] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const toggle = (next: Exclude<Panel, null>) => setPanel((open) => (open === next ? null : next))

  const created = useCallback((mentor: Mentor, researching: boolean) => {
    setMentors((current) => [...current, mentor])
    setPanel(null)
    setNotice(
      researching
        ? `${mentor.name} was created. We are searching the web for more about them and building their memory; this takes a few minutes. Bring them to the square from their card when you are ready.`
        : `${mentor.name} was created. Their memory is being built in the background. Bring them to the square from their card when you are ready.`,
    )
  }, [])

  // The panel stays open, so several presets can be created in a row.
  const presetCreated = useCallback((mentor: Mentor) => {
    setMentors((current) => [...current, mentor])
    setNotice(
      `${mentor.name} was created from the presets and is building their memory from stored notes. They are not in the square yet: use "Bring to the square" on their card.`,
    )
  }, [])

  /** Rejects on failure so the card can show why. */
  const setSquare = useCallback(async (mentor: Mentor, inSquare: boolean) => {
    const updated = await setInSquare(mentor.id, inSquare)
    setMentors((current) => current.map((m) => (m.id === updated.id ? updated : m)))
    setNotice(inSquare ? `${mentor.name} is now in the square.` : `${mentor.name} left the square.`)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getMentorPool(controller.signal)
      .then((pool) => setPoolLeft(typeof pool.remaining === 'number' ? pool.remaining : null))
      .catch(() => setPoolLeft(null)) // no pool endpoint: hide the button
    return () => controller.abort()
  }, [mentors.length])

  const addMentor = useCallback(() => {
    setAdding(true)
    addRandomMentor()
      .then((mentor) => {
        setMentors((current) => [...current, mentor])
        setNotice(`${mentor.name} joined. Their memory is being built in the background.`)
      })
      .catch((cause: unknown) => {
        setNotice(cause instanceof ApiError ? cause.message : 'Nobody could be added right now.')
      })
      .finally(() => setAdding(false))
  }, [])

  /** Rejects on failure so the card can show why; on success the card disappears. */
  const remove = useCallback(async (mentor: Mentor) => {
    await removeMentor(mentor.id)
    clearConversation(mentor.id)
    setMentors((current) => current.filter((m) => m.id !== mentor.id))
    setNotice(`${mentor.name} was removed.`)
  }, [])

  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold sm:text-4xl">
          Where human expertise
          <br />
          meets <span className="text-accent">AI</span>
        </h1>
        <p className="mt-4 text-balance leading-relaxed text-muted">
          Chat with mentors modelled on real experts. Each one answers from a long-term memory built
          out of that person&rsquo;s public work.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => toggle('create')}
            aria-expanded={panel === 'create'}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-pixel text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            <PenLine size={15} aria-hidden="true" />
            Create a mentor
          </button>
          <button
            type="button"
            onClick={() => toggle('preset')}
            aria-expanded={panel === 'preset'}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-raised"
          >
            <Library size={15} aria-hidden="true" />
            Add a preset mentor
          </button>
          {poolLeft !== null && (
            <button
              type="button"
              onClick={addMentor}
              disabled={adding || poolLeft === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-raised disabled:opacity-50"
            >
              <UserPlus size={15} aria-hidden="true" />
              {poolLeft === 0 ? 'Everyone is here' : adding ? 'Inviting…' : 'Add a random mentor'}
            </button>
          )}
          <p role="status" className="text-sm text-muted">
            {notice}
          </p>
        </div>
      </div>

      {panel === 'preset' && (
        <div className="max-w-2xl">
          <PresetPicker onCreated={presetCreated} />
        </div>
      )}

      {panel === 'create' && (
        <div className="max-w-2xl">
          <CreateMentorForm onCreated={created} onCancel={() => setPanel(null)} />
        </div>
      )}

      <div className="mt-10">
        {status === 'loading' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <MentorCardSkeleton key={i} />
            ))}
            <span className="sr-only" role="status">
              Loading mentors
            </span>
          </div>
        )}

        {status === 'error' && (
          <ErrorState
            title="Can’t load the mentors"
            description={
              error.includes('reach')
                ? `Cannot reach the API at ${API_BASE_URL || window.location.origin}. Is the backend running?`
                : error
            }
            onRetry={retry}
          />
        )}

        {status === 'ready' &&
          (mentors.length ? (
            <div className="space-y-10">
              <MentorSection
                title="In the square"
                description="Wandering Mentor Square, ready to talk."
                empty="Nobody is in the square. Bring a mentor in from the list below."
                mentors={mentors.filter((m) => m.in_square)}
                onRemove={remove}
                onSetInSquare={setSquare}
              />
              <MentorSection
                title="Not in the square"
                description="Sent out or not yet brought in. They keep their memory; bring them back any time."
                empty="Everyone is in the square. Mentors you send out wait here."
                mentors={mentors.filter((m) => !m.in_square)}
                onRemove={remove}
                onSetInSquare={setSquare}
              />
            </div>
          ) : (
            <EmptyState
              icon={<Users size={20} aria-hidden="true" />}
              title="No mentors yet"
              description="Create your own mentor from their videos, articles and posts, or add a random one."
            />
          ))}
      </div>
    </main>
  )
}

interface SectionProps {
  title: string
  description: string
  /** Shown when this section has nobody in it. */
  empty: string
  mentors: Mentor[]
  onRemove: (mentor: Mentor) => Promise<void>
  onSetInSquare: (mentor: Mentor, inSquare: boolean) => Promise<void>
}

/** One group of mentor cards, with a heading and a count. */
function MentorSection({
  title,
  description,
  empty,
  mentors,
  onRemove,
  onSetInSquare,
}: SectionProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="font-pixel text-lg font-semibold">
        {title} <span className="text-muted">({mentors.length})</span>
      </h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      {mentors.length ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mentors.map((mentor) => (
            <MentorCard
              key={mentor.id}
              mentor={mentor}
              onRemove={onRemove}
              onSetInSquare={onSetInSquare}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted">
          {empty}
        </p>
      )}
    </section>
  )
}
