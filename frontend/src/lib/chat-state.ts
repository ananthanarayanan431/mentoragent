/**
 * Chat state as a pure reducer.
 *
 * Keeping the transitions out of the component makes the streaming protocol
 * (start -> chunk* -> end) testable without a socket or a DOM.
 */

import type { Message, ServerEvent } from '../types'

export interface ChatState {
  messages: Message[]
  /** Set by the first `start` event; sent back to continue the conversation. */
  conversationId: string | null
  /** True from sending a message until `end` or `error` arrives. */
  isStreaming: boolean
}

export type ChatAction =
  | { type: 'restore'; state: ChatState }
  | { type: 'send'; id: string; content: string }
  | { type: 'server'; event: ServerEvent }
  | { type: 'failed'; detail: string }
  | { type: 'reset' }

export const initialChatState: ChatState = {
  messages: [],
  conversationId: null,
  isStreaming: false,
}

/** Turn an `error` event's `detail` into one line of text. */
export function formatDetail(detail: unknown): string {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => (item && typeof item === 'object' ? (item as { msg?: unknown }).msg : item))
      .filter((msg): msg is string => typeof msg === 'string' && msg.trim().length > 0)
    if (parts.length) return parts.join('; ')
  }
  return 'Something went wrong.'
}

let counter = 0

/** Unique id for a message. `crypto.randomUUID` needs a secure context. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  counter += 1
  return `m${Date.now()}-${counter}`
}

/** Replace the last mentor message, which is the one currently streaming. */
function updateStreaming(messages: Message[], update: (message: Message) => Message): Message[] {
  const index = messages.findLastIndex((m) => m.role === 'mentor' && m.streaming)
  if (index === -1) return messages
  const next = messages.slice()
  next[index] = update(messages[index]!)
  return next
}

/** Close off a half-finished reply and append an error notice. */
function fail(state: ChatState, detail: string): ChatState {
  const settled = updateStreaming(state.messages, (m) => ({
    ...m,
    streaming: false,
  })).filter((m) => m.role !== 'mentor' || m.content.length > 0 || m.failed)

  return {
    ...state,
    isStreaming: false,
    messages: [...settled, { id: newId(), role: 'mentor', content: detail, failed: true }],
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'restore':
      return action.state

    case 'send':
      return {
        ...state,
        isStreaming: true,
        messages: [
          ...state.messages,
          { id: action.id, role: 'user', content: action.content },
          // The empty placeholder is what `chunk` events fill in.
          { id: newId(), role: 'mentor', content: '', streaming: true },
        ],
      }

    case 'failed':
      return fail(state, action.detail)

    case 'reset':
      return initialChatState

    case 'server': {
      const event = action.event
      switch (event.type) {
        case 'start':
          return { ...state, conversationId: event.conversation_id, isStreaming: true }

        case 'chunk':
          return {
            ...state,
            messages: updateStreaming(state.messages, (m) => ({
              ...m,
              content: m.content + event.content,
            })),
          }

        case 'end':
          return {
            ...state,
            conversationId: event.conversation_id,
            isStreaming: false,
            // Trust `response` over the concatenated chunks: it is the whole
            // reply, so a dropped chunk cannot leave a message with a hole.
            messages: updateStreaming(state.messages, (m) => ({
              ...m,
              content: event.response || m.content,
              streaming: false,
            })),
          }

        case 'error':
          return fail(state, formatDetail(event.detail))
      }
    }
  }
}

/** Parse a WebSocket payload, returning null when it is not a known event. */
export function parseServerEvent(data: unknown): ServerEvent | null {
  if (typeof data !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const event = parsed as Record<string, unknown>
  switch (event.type) {
    case 'start':
      return typeof event.conversation_id === 'string'
        ? { type: 'start', conversation_id: event.conversation_id }
        : null
    case 'chunk':
      return typeof event.content === 'string' ? { type: 'chunk', content: event.content } : null
    case 'end':
      return typeof event.conversation_id === 'string' && typeof event.response === 'string'
        ? { type: 'end', conversation_id: event.conversation_id, response: event.response }
        : null
    case 'error':
      return { type: 'error', detail: event.detail }
    default:
      return null
  }
}
