import { useCallback, useEffect, useReducer, useRef } from 'react'

import { ApiError, deleteConversation, sendChat } from '@/lib/api'
import type { ServerEvent } from '@/lib/types'
import { chatReducer, newId, type ChatState } from './chat-state'
import { clearConversation, loadConversation, saveConversation } from './storage'
import { useChatSocket, type SocketStatus } from './use-chat-socket'

export interface MentorConversation {
  state: ChatState
  status: SocketStatus
  reconnect: () => void
  /** Sends `text`. Returns false (and does nothing) when it is blank or a reply is streaming. */
  send: (text: string) => boolean
  /** Forgets the conversation here and, best effort, on the server. */
  startNewChat: () => void
}

/**
 * One conversation with one mentor: the streaming socket, the reducer, and
 * per-mentor persistence. Shared by the chat page and the world's dialogue box.
 *
 * Every piece of state belongs to `mentorId`, so callers mount it with
 * `key={mentorId}` rather than switching mentors in place.
 */
export function useMentorConversation(mentorId: string): MentorConversation {
  // Seeded from localStorage, so a reload paints the history immediately.
  const [state, dispatch] = useReducer(chatReducer, mentorId, loadConversation)

  // The reducer's own state, readable from callbacks without re-subscribing.
  // Event handlers run after effects have flushed, so this is never stale.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    // Skip while streaming: a half-written reply should not be restored.
    if (!mentorId || state.isStreaming) return
    saveConversation(mentorId, state)
  }, [mentorId, state])

  const handleEvent = useCallback((event: ServerEvent) => {
    dispatch({ type: 'server', event })
  }, [])

  const handleDropped = useCallback(() => {
    dispatch({ type: 'failed', detail: 'The connection dropped before the reply finished.' })
  }, [])

  const socket = useChatSocket({ onEvent: handleEvent, onDropped: handleDropped })
  const socketSend = socket.send

  const send = useCallback(
    (text: string): boolean => {
      const content = text.trim()
      if (!content || stateRef.current.isStreaming) return false

      dispatch({ type: 'send', id: newId(), content })

      const conversationId = stateRef.current.conversationId
      const request = {
        mentor_id: mentorId,
        message: content,
        ...(conversationId ? { conversation_id: conversationId } : {}),
      }

      if (socketSend(request)) return true

      // Socket unavailable: fall back to the non-streaming endpoint so the
      // conversation still works, just without token-by-token output.
      sendChat(request)
        .then((reply) => {
          dispatch({
            type: 'server',
            event: {
              type: 'end',
              conversation_id: reply.conversation_id,
              response: reply.response,
            },
          })
        })
        .catch((cause: unknown) => {
          dispatch({
            type: 'failed',
            detail: cause instanceof ApiError ? cause.message : 'The message could not be sent.',
          })
        })
      return true
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

  return { state, status: socket.status, reconnect: socket.reconnect, send, startNewChat }
}
