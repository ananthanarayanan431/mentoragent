/**
 * Shapes the web app works with.
 *
 * REST bodies come from the generated contract (libs/mentor-agent-contracts), so a
 * backend change that breaks them fails type-checking. The WebSocket events are not
 * part of OpenAPI and are declared here, next to the UI-only types.
 */
import type {
  ChatRequest,
  ChatResponse,
  MentorCreate,
  MentorOut,
  MentorSources,
  MentorUpdate,
  PoolOut,
} from '@mentoragent/mentor-agent-contracts'

export type { ChatRequest, ChatResponse, MentorCreate, MentorSources, MentorUpdate, PoolOut }
export type Mentor = MentorOut

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
