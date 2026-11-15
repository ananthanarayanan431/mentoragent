/**
 * Shapes the web app works with.
 *
 * REST bodies come from the generated contract (libs/mentor-agent-contracts), so a
 * backend change that breaks them fails type-checking. The WebSocket events are not
 * part of OpenAPI and are declared here, next to the UI-only types.
 */
import type {
  AmbientChatOut,
  ChatRequest,
  ChatResponse,
  GoalOut,
  LedgerLineOut,
  MentorCreate,
  MentorOut,
  MentorSources,
  MentorUpdate,
  PoolOut,
} from '@mentoragent/mentor-agent-contracts'

export type {
  ChatRequest,
  ChatResponse,
  GoalOut,
  MentorCreate,
  MentorSources,
  MentorUpdate,
  PoolOut,
}
export type Mentor = MentorOut
/** Two mentors chatting about your goal (overheard in the square). */
export type AmbientChat = AmbientChatOut
/** One piece of advice a mentor gave you, as every mentor reads it. */
export type LedgerLine = LedgerLineOut

/**
 * Events the WebSocket sends, one per turn: start -> chunk* -> end, or error.
 * `silent` answers a request to speak first when the mentor has nothing new to say.
 */
export type ServerEvent =
  | { type: 'start'; conversation_id: string; mentor_id?: string }
  | { type: 'chunk'; content: string; mentor_id?: string }
  | { type: 'end'; conversation_id: string; response: string; mentor_id?: string }
  | { type: 'error'; detail: unknown }
  | { type: 'silent'; conversation_id: string | null }
  /** A group turn is over: both mentors have answered. */
  | { type: 'turn_end'; conversation_id: string }

/** Asks a mentor to speak first (WebSocket only), when the player walks up to them. */
export interface OpenerRequest {
  mentor_id: string
  opener: true
  conversation_id?: string
}

/**
 * A message to two mentors at once (WebSocket only); the first answers first, then
 * the second, having read the first. Every reply event carries `mentor_id`.
 */
export interface GroupChatRequest {
  mentor_ids: [string, string]
  message: string
  conversation_id?: string
  /** The ambient chat the player joined; sent on the first turn only. */
  ambient_id?: string
}

/** What the client sends over the WebSocket. */
export type ClientMessage = ChatRequest | OpenerRequest | GroupChatRequest

export type Role = 'user' | 'mentor'

export interface Message {
  id: string
  role: Role
  content: string
  /** True while tokens are still arriving for this message. */
  streaming?: boolean
  /** True when the message is an error notice rather than a real reply. */
  failed?: boolean
  /** Which mentor said it, in a conversation with two; absent one-on-one. */
  mentorId?: string
}
