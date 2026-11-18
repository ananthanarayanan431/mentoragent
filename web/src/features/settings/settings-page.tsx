import { useCallback, useEffect, useState } from 'react'

import { ErrorState, Spinner } from '@/components/state-views'
import { loadFriendship } from '@/features/world/progress'
import { useLedger } from '@/features/world/use-ledger'
import { ApiError, getGoal, listMentors, setGoal } from '@/lib/api'
import type { Mentor } from '@/lib/types'
import { GoalPanel } from './goal-panel'
import { LedgerList } from './ledger-list'
import { MentorsMet } from './mentors-met'
import { SquarePanel } from './square-panel'
import type { PortraitFor } from './section'

/**
 * Settings for the square you are in: its name, your goal there, the mentors you have
 * met in it and what they told you. Kept off the square so the square shows only the
 * mentors and your conversation.
 */
export function SettingsPage() {
  const [mentors, setMentors] = useState<Mentor[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [goal, setGoalText] = useState<string | null>(null)
  const [friendship] = useState(loadFriendship)
  const ledger = useLedger()
  const portraitFor = usePortraits()

  useEffect(() => {
    const controller = new AbortController()
    listMentors(controller.signal)
      .then(setMentors)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof ApiError ? cause.message : 'Could not load the mentors.')
      })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    const controller = new AbortController()
    getGoal(controller.signal)
      .then(({ goal: saved }) => setGoalText(saved ?? null))
      .catch(() => {}) // the goal is optional: without it the panel invites one
    return () => controller.abort()
  }, [])

  const saveGoal = useCallback(async (next: string) => {
    const { goal: saved } = await setGoal(next)
    setGoalText(saved ?? null)
  }, [])

  return (
    <main className="mx-auto w-full max-w-3xl space-y-10 px-4 py-8 sm:py-12">
      <header>
        <h1 className="font-pixel text-3xl font-semibold tracking-wide text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          For this square: your goal, the mentors you have met and what they told you. Each square
          keeps its own.
        </p>
      </header>

      <GoalPanel goal={goal} onSave={saveGoal} />

      {error ? (
        <ErrorState
          title="Could not load the mentors"
          description={error}
          onRetry={() => {
            setError('')
            setAttempt((n) => n + 1)
          }}
        />
      ) : mentors ? (
        <MentorsMet mentors={mentors} friendship={friendship} portraitFor={portraitFor} />
      ) : (
        <Spinner label="Loading the mentors" />
      )}

      <LedgerList
        lines={ledger.lines}
        error={ledger.error}
        onForget={ledger.forget}
        portraitFor={portraitFor}
      />

      <SquarePanel />
    </main>
  )
}

/**
 * The mentors' sprite portraits, drawn by the square's art code. Loaded lazily (no
 * Phaser in it, but it is the game's), so the page shows initials until it lands.
 */
function usePortraits(): PortraitFor {
  const [portraitFor, setPortraitFor] = useState<PortraitFor>(null)
  useEffect(() => {
    let live = true
    import('@/features/world/game/portraits')
      .then((module) => {
        if (live) setPortraitFor(() => module.portraitFor)
      })
      .catch(() => {}) // initials it is
    return () => {
      live = false
    }
  }, [])
  return portraitFor
}
