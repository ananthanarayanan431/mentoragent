import { useCallback, useEffect, useReducer, useRef } from 'react'

import { deleteConversation } from '@/lib/api'
import type { GroupChatRequest, ServerEvent } from '@/lib/types'
import { chatReducer, newId, type ChatState } from './chat-state'
import { clearConversation, groupKey, loadConversation, saveConversation } from './storage'
import { useChatSocket, type SocketStatus } from './use-chat-socket'

export interface GroupConversation {
  state: ChatState
  status: SocketStatus
  /** Sends `text` to both mentors. False when blank, mid-turn, or the socket is closed. */
  send: (text: string) => boolean
  /** Forgets the conversation here and, best effort, both mentors' threads on the server. */
  startNewChat: () => void
}

/**
 * One conversation with two mentors (joined in the square): each message gets a
 * reply from both, the first speaker first. Kept per pair, whoever was walked up
 * to. Mount with a `key` per pair, as `useMentorConversation` is per mentor.
 *
 * @param ambientId The chat the player joined; sent with the first message so both
 *   mentors remember what they were saying.
 */
export function useGroupConversation(
  mentorIds: [string, string],
  ambientId: string | null,
): GroupConversation {
  const storageKey = groupKey(mentorIds)
  const [state, dispatch] = useReducer(chatReducer, storageKey, loadConversation)
  const stateRef = useRef(state)
  const ambientSent = useRef(false)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (!state.isStreaming) saveConversation(storageKey, state)
  }, [storageKey, state])

  const handleEvent = useCallback((event: ServerEvent) => {
    dispatch({ type: 'server', event })
  }, [])
  const handleDropped = useCallback(() => {
    dispatch({ type: 'failed', detail: 'The connection dropped before the replies finished.' })
  }, [])
  const socket = useChatSocket({ onEvent: handleEvent, onDropped: handleDropped })
  const socketSend = socket.send
  const [first, second] = mentorIds

  const send = useCallback(
    (text: string): boolean => {
      const content = text.trim()
      if (!content || stateRef.current.isStreaming) return false
      const conversationId = stateRef.current.conversationId
      const request: GroupChatRequest = {
        mentor_ids: [first, second],
        message: content,
        ...(conversationId ? { conversation_id: conversationId } : {}),
        ...(ambientId && !ambientSent.current ? { ambient_id: ambientId } : {}),
      }
      // No HTTP fallback: group conversations need the socket.
      if (!socketSend(request)) return false
      ambientSent.current = true
      dispatch({ type: 'sendGroup', id: newId(), content })
      return true
    },
    [first, second, ambientId, socketSend],
  )

  const startNewChat = useCallback(() => {
    const { conversationId } = stateRef.current
    dispatch({ type: 'reset' })
    clearConversation(storageKey)
    if (conversationId) {
      for (const mentorId of [first, second]) {
        void deleteConversation(mentorId, conversationId).catch(() => {})
      }
    }
  }, [storageKey, first, second])

  return { state, status: socket.status, send, startNewChat }
}
