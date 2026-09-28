/** Typed client for the MentorAgents API. */

import { API_KEY, API_PREFIX, httpUrl } from './config'
import type { ChatRequest, ChatResponse, Mentor } from '../types'

/** An API call that failed, carrying a message fit to show the user. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
  }

  /** True when the backend could not be reached at all. */
  get isOffline(): boolean {
    return this.status === 0
  }
}

/**
 * Pull a human-readable message out of an error body.
 *
 * FastAPI uses `detail`, which is a string for our own exceptions but a list of
 * objects for request-validation failures; the project's handlers also return
 * `message`. Anything unrecognised falls back to the caller's default.
 */
function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body
  if (!body || typeof body !== 'object') return fallback

  const { detail, message } = body as { detail?: unknown; message?: unknown }
  if (typeof message === 'string' && message.trim()) return message
  if (typeof detail === 'string' && detail.trim()) return detail

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => (item && typeof item === 'object' ? (item as { msg?: unknown }).msg : item))
      .filter((msg): msg is string => typeof msg === 'string' && msg.trim().length > 0)
    if (parts.length) return parts.join('; ')
  }
  return fallback
}

const STATUS_FALLBACKS: Record<number, string> = {
  401: 'Not authorised — check the API key.',
  403: 'Not authorised — check the API key.',
  404: 'Not found.',
  429: 'Too many requests — try again shortly.',
  503: 'The service is temporarily unavailable.',
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (API_KEY) headers.set('X-API-Key', API_KEY)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    response = await fetch(httpUrl(path), { ...init, headers })
  } catch (cause) {
    // fetch only rejects on network-level failures, so the API is unreachable.
    throw new ApiError('Cannot reach the server. Is the backend running?', 0, { cause })
  }

  if (!response.ok) {
    const fallback = STATUS_FALLBACKS[response.status] ?? `Request failed (${response.status}).`
    const body = await response.json().catch(() => null)
    throw new ApiError(messageFromBody(body, fallback), response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function listMentors(signal?: AbortSignal): Promise<Mentor[]> {
  return request<Mentor[]>(`${API_PREFIX}/mentors`, signal ? { signal } : {})
}

export function getMentor(mentorId: string, signal?: AbortSignal): Promise<Mentor> {
  const path = `${API_PREFIX}/mentors/${encodeURIComponent(mentorId)}`
  return request<Mentor>(path, signal ? { signal } : {})
}

/** Non-streaming reply; the fallback used when the WebSocket cannot connect. */
export function sendChat(body: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  return request<ChatResponse>(`${API_PREFIX}/chat`, {
    method: 'POST',
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
}

/** Forget a conversation's history. Succeeds even if it was never stored. */
export function deleteConversation(mentorId: string, conversationId: string): Promise<void> {
  const path = `${API_PREFIX}/conversations/${encodeURIComponent(mentorId)}/${encodeURIComponent(
    conversationId,
  )}`
  return request<void>(path, { method: 'DELETE' })
}
