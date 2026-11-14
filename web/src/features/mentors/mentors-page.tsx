import { PenLine, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { CreateMentorForm } from './create-mentor-form'
import { MentorCard } from './mentor-card'
import { EmptyState, ErrorState, MentorCardSkeleton } from '@/components/state-views'
import { clearConversation } from '@/features/chat/storage'
import { addRandomMentor, ApiError, getMentorPool, listMentors, removeMentor } from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import type { Mentor } from '@/lib/types'

type Status = 'loading' | 'ready' | 'error'

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

  const [poolLeft, setPoolLeft] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)

  const created = useCallback((mentor: Mentor) => {
    setMentors((current) => [...current, mentor])
    setCreating(false)
    setNotice(`${mentor.name} was created. Their memory is being built in the background.`)
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
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
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
            onClick={() => setCreating((open) => !open)}
            aria-expanded={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            <PenLine size={15} aria-hidden="true" />
            Create a mentor
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

      {creating && (
        <div className="max-w-2xl">
          <CreateMentorForm onCreated={created} onCancel={() => setCreating(false)} />
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mentors.map((mentor) => (
                <MentorCard key={mentor.id} mentor={mentor} onRemove={remove} />
              ))}
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
