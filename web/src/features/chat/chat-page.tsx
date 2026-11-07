import { ArrowLeft, Info, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Composer } from './composer'
import { ConnectionBadge } from './connection-badge'
import { MentorPanel } from './mentor-panel'
import { MessageList } from './message-list'
import { ErrorState, Spinner } from '@/components/state-views'
import { ApiError, getMentor } from '@/lib/api'
import type { Mentor } from '@/lib/types'
import { useMentorConversation } from './use-mentor-conversation'

export function ChatPage() {
  const { mentorId = '' } = useParams<{ mentorId: string }>()
  // Every piece of state below belongs to one mentor, so switching mentors
  // remounts rather than resetting half a dozen things by hand.
  return <ChatView key={mentorId} mentorId={mentorId} />
}

function ChatView({ mentorId }: { mentorId: string }) {
  const [mentor, setMentor] = useState<Mentor | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [draft, setDraft] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const conversation = useMentorConversation(mentorId)
  const { state, send, startNewChat } = conversation

  useEffect(() => {
    const controller = new AbortController()

    getMentor(mentorId, controller.signal)
      .then(setMentor)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(
          cause instanceof ApiError ? cause : new ApiError('Could not load this mentor.', 500),
        )
      })

    return () => controller.abort()
  }, [mentorId])

  const submit = useCallback(
    (text: string) => {
      if (send(text)) setDraft('')
    },
    [send],
  )

  // --- Render ---------------------------------------------------------------

  if (loadError) {
    const missing = loadError.status === 404
    return (
      <main className="grid flex-1 place-items-center p-6">
        <div className="space-y-5 text-center">
          <ErrorState
            title={missing ? 'Mentor not found' : 'Could not open this chat'}
            description={
              missing ? `There is no mentor with the id “${mentorId}”.` : loadError.message
            }
          />
          <Link
            to="/mentors"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to all mentors
          </Link>
        </div>
      </main>
    )
  }

  if (!mentor) {
    return (
      <main className="grid flex-1 place-items-center gap-3 p-6">
        <Spinner label="Loading mentor" />
      </main>
    )
  }

  return (
    <main className="flex flex-1 overflow-hidden">
      {/* Sidebar: static from lg up, a drawer below it. */}
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-line bg-surface lg:block">
        <MentorPanel mentor={mentor} onChange={setMentor} />
      </aside>

      {panelOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close mentor details"
            onClick={() => setPanelOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-surface shadow-xl">
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised"
              >
                <X size={16} aria-hidden="true" />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <MentorPanel mentor={mentor} onChange={setMentor} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised lg:hidden"
            >
              <Info size={16} aria-hidden="true" />
              <span className="sr-only">Mentor details</span>
            </button>
            <p className="truncate text-sm font-medium lg:hidden">{mentor.name}</p>
            <ConnectionBadge status={conversation.status} onReconnect={conversation.reconnect} />
          </div>

          <button
            type="button"
            onClick={startNewChat}
            disabled={state.isStreaming || !state.messages.length}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-raised disabled:opacity-40"
          >
            <RotateCcw size={13} aria-hidden="true" />
            New chat
          </button>
        </div>

        <MessageList messages={state.messages} mentor={mentor} onSuggestion={submit} />

        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={() => submit(draft)}
          disabled={state.isStreaming}
          mentorName={mentor.name}
        />
      </div>
    </main>
  )
}
