/** Shapes shared with the backend (`mentoragent.api.schemas`). */

export interface Mentor {
  id: string
  name: string
  expertise: string
  perspective: string
  style: string
  image_url: string | null
}

export interface ChatRequest {
  mentor_id: string
  message: string
  /** Omit to start a new conversation. */
  conversation_id?: string
}

export interface ChatResponse {
  mentor_id: string
  conversation_id: string
  response: string
}

/** Events the WebSocket sends, one per turn: start -> chunk* -> end, or error. */
export type ServerEvent =
  | { type: 'start'; conversation_id: string }
  | { type: 'chunk'; content: string }
  | { type: 'end'; conversation_id: string; response: string }
  | { type: 'error'; detail: unknown }

export type Role = 'user' | 'mentor'

export interface Message {
  id: string
  role: Role
  content: string
  /** True while tokens are still arriving for this message. */
  streaming?: boolean
  /** True when the message is an error notice rather than a real reply. */
  failed?: boolean
}
