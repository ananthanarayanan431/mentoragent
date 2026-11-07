/**
 * Per-mentor conversation persistence in localStorage, so a reload resumes
 * where the user left off.
 *
 * Every access is wrapped: localStorage throws in private windows and when a
 * browser blocks site data, and a chat that cannot be saved must still work.
 */

import type { ChatState } from './chat-state'
import { initialChatState } from './chat-state'
import type { Message, Role } from '../types'

const PREFIX = 'mentoragent:conversation:'
/** Keeps a long chat from outgrowing the ~5MB localStorage budget. */
const MAX_STORED_MESSAGES = 100

function key(mentorId: string): string {
  return `${PREFIX}${mentorId}`
}

function isRole(value: unknown): value is Role {
  return value === 'user' || value === 'mentor'
}

/** Validate untrusted stored JSON: the format may be from an older version. */
function parseState(raw: string): ChatState | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const { messages, conversationId } = parsed as Record<string, unknown>
  if (!Array.isArray(messages)) return null

  const restored: Message[] = []
  for (const item of messages) {
    if (!item || typeof item !== 'object') continue
    const { id, role, content, failed } = item as Record<string, unknown>
    if (typeof id !== 'string' || !isRole(role) || typeof content !== 'string') continue
    // A reply that was mid-stream when the tab closed is never resumed.
    restored.push({ id, role, content, ...(failed === true ? { failed: true } : {}) })
  }

  return {
    messages: restored,
    conversationId: typeof conversationId === 'string' ? conversationId : null,
    isStreaming: false,
  }
}

export function loadConversation(mentorId: string): ChatState {
  try {
    const raw = window.localStorage.getItem(key(mentorId))
    return raw ? (parseState(raw) ?? initialChatState) : initialChatState
  } catch {
    return initialChatState
  }
}

export function saveConversation(mentorId: string, state: ChatState): void {
  try {
    // Drop the placeholder for a reply that has not started arriving yet.
    const messages = state.messages
      .filter((m) => m.content.length > 0)
      .slice(-MAX_STORED_MESSAGES)
      .map(({ id, role, content, failed }) => ({ id, role, content, failed }))

    if (!messages.length && !state.conversationId) {
      window.localStorage.removeItem(key(mentorId))
      return
    }
    window.localStorage.setItem(
      key(mentorId),
      JSON.stringify({ messages, conversationId: state.conversationId }),
    )
  } catch {
    // Out of quota or storage blocked: the chat continues in memory.
  }
}

export function clearConversation(mentorId: string): void {
  try {
    window.localStorage.removeItem(key(mentorId))
  } catch {
    // Nothing to do; the caller resets in-memory state regardless.
  }
}
