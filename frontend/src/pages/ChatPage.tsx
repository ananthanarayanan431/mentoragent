import { ArrowLeft, Info, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Composer } from '../components/chat/Composer'
import { ConnectionBadge } from '../components/chat/ConnectionBadge'
import { MentorPanel } from '../components/chat/MentorPanel'
import { MessageList } from '../components/chat/MessageList'
import { ErrorState, Spinner } from '../components/StateViews'
import { useChatSocket } from '../hooks/useChatSocket'
import { ApiError, deleteConversation, getMentor, sendChat } from '../lib/api'
import { chatReducer, initialChatState, newId } from '../lib/chat-state'
import { clearConversation, loadConversation, saveConversation } from '../lib/storage'
import type { Mentor, ServerEvent } from '../types'

export function ChatPage() {
  const { mentorId = '' } = useParams<{ mentorId: string }>()

  const [mentor, setMentor] = useState<Mentor | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [draft, setDraft] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [state, dispatch] = useReducer(chatReducer, initialChatState)

  // The reducer's own state, readable from callbacks without re-subscribing.
  const stateRef = useRef(state)
  stateRef.current = state

  // --- Mentor ---------------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController()
    setMentor(null)
    setLoadError(null)
    // Restore before the request resolves so the history paints immediately.
    dispatch({ type: 'restore', state: loadConversation(mentorId) })

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

  // --- Persistence ----------------------------------------------------------

  useEffect(() => {
    // Skip while streaming: a half-written reply should not be restored.
    if (!mentorId || state.isStreaming) return
    saveConversation(mentorId, state)
  }, [mentorId, state])

  // --- Streaming socket -----------------------------------------------------

  const handleEvent = useCallback((event: ServerEvent) => {
    dispatch({ type: 'server', event })
  }, [])

  const handleDropped = useCallback(() => {
    dispatch({ type: 'failed', detail: 'The connection dropped before the reply finished.' })
  }, [])

  const socket = useChatSocket({ onEvent: handleEvent, onDropped: handleDropped })
  const socketSend = socket.send

  // --- Sending --------------------------------------------------------------

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || stateRef.current.isStreaming) return

      setDraft('')
      dispatch({ type: 'send', id: newId(), content })

      const conversationId = stateRef.current.conversationId
      const request = {
        mentor_id: mentorId,
        message: content,
        ...(conversationId ? { conversation_id: conversationId } : {}),
      }

      if (socketSend(request)) return

      // Socket unavailable: fall back to the non-streaming endpoint so the
      // conversation still works, just without token-by-token output.
      try {
        const reply = await sendChat(request)
        dispatch({
          type: 'server',
          event: {
            type: 'end',
            conversation_id: reply.conversation_id,
            response: reply.response,
          },
        })
      } catch (cause) {
        dispatch({
          type: 'failed',
          detail: cause instanceof ApiError ? cause.message : 'The message could not be sent.',
        })
      }
    },
    [mentorId, socketSend],
  )

  const startNewChat = useCallback(() => {
    const { conversationId } = stateRef.current
    dispatch({ type: 'reset' })
    clearConversation(mentorId)
    if (conversationId) {
      // Best effort: local state is already cleared either way.
      void deleteConversation(mentorId, conversationId).catch(() => {})
    }
  }, [mentorId])

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
            to="/"
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
        <MentorPanel mentor={mentor} />
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
            <MentorPanel mentor={mentor} />
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
            <ConnectionBadge status={socket.status} onReconnect={socket.reconnect} />
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

        <MessageList messages={state.messages} mentor={mentor} onSuggestion={send} />

        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void send(draft)}
          disabled={state.isStreaming}
          mentorName={mentor.name}
        />
      </div>
    </main>
  )
}
