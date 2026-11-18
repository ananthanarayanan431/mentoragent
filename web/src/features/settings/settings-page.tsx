import { useCallback, useEffect, useState } from 'react'

import { ErrorState, Spinner } from '@/components/state-views'
import { GoalPanel } from '@/features/world/goal-panel'
import { LedgerList } from '@/features/world/ledger-list'
import { loadFriendship } from '@/features/world/progress'
import { useLedger } from '@/features/world/use-ledger'
import { ApiError, getGoal, listMentors, setGoal } from '@/lib/api'
import type { Mentor } from '@/lib/types'
import { MentorsMet } from './mentors-met'

/**
 * Settings: your goal, the mentors you have met and what they told you. Kept off
 * the square so the square shows only the mentors and your conversation.
 */
export function SettingsPage() {
  const [mentors, setMentors] = useState<Mentor[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [goal, setGoalText] = useState<string | null>(null)
  const [friendship] = useState(loadFriendship)
  const ledger = useLedger()

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
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Your goal, the mentors you have met and what they told you.
        </p>
      </div>

      <div className="space-y-5 rounded-xl border border-line bg-surface p-5">
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
          <div className="border-b border-line pb-3">
            <MentorsMet mentors={mentors} friendship={friendship} />
          </div>
        ) : (
          <Spinner label="Loading the mentors" />
        )}

        <LedgerList lines={ledger.lines} error={ledger.error} onForget={ledger.forget} />
      </div>
    </main>
  )
}
