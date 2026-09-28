import { Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { MentorCard } from '../components/MentorCard'
import { EmptyState, ErrorState, MentorCardSkeleton } from '../components/StateViews'
import { ApiError, listMentors } from '../lib/api'
import { API_BASE_URL } from '../lib/config'
import type { Mentor } from '../types'

type Status = 'loading' | 'ready' | 'error'

export function MentorsPage() {
  const [mentors, setMentors] = useState<Mentor[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string>('')
  // Bumped by "Try again" to re-run the effect.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')

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

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Where human expertise
          <br />
          meets <span className="text-accent">AI</span>
        </h1>
        <p className="mt-4 text-balance leading-relaxed text-muted">
          Chat with mentors modelled on real experts. Each one answers from a long-term memory
          built out of that person&rsquo;s public work.
        </p>
      </div>

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
                <MentorCard key={mentor.id} mentor={mentor} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Users size={20} aria-hidden="true" />}
              title="No mentors yet"
              description="The database has no mentors. Run the extraction pipeline in the backend to add some."
            />
          ))}
      </div>
    </main>
  )
}
