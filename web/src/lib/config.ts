/**
 * Runtime configuration, read from the VITE_* variables baked in at build time.
 *
 * `VITE_API_URL` is empty by default, which means "same origin as the app".
 * That is what both `npm run dev` (Vite proxies to the backend) and the nginx
 * image (which reverse-proxies /api) rely on.
 */

/** API base with any trailing slash removed, or '' for the current origin. */
export const API_BASE_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

/**
 * Sent as `X-API-Key`, and as the `api_key` query parameter on the WebSocket
 * (browsers cannot set headers on a WebSocket handshake).
 *
 * Anything shipped to the browser is readable by whoever loads the page, so
 * this is a light gate for a private deployment, not authentication.
 */
export const API_KEY: string = import.meta.env.VITE_API_KEY ?? ''

export const API_PREFIX = '/api/v1'

/** The longest message the backend accepts (`AgentSettings.MAX_MESSAGE_CHARS`). */
export const MAX_MESSAGE_CHARS = 4000

/** Absolute URL for an API path, e.g. httpUrl('/api/v1/mentors'). */
export function httpUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

/**
 * WebSocket URL for `path`, upgrading the scheme to match the page: a page on
 * https must use wss, or the browser blocks the connection as mixed content.
 */
export function wsUrl(path: string): string {
  const base = API_BASE_URL || window.location.origin
  const url = new URL(`${base}${path}`, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (API_KEY) url.searchParams.set('api_key', API_KEY)
  return url.toString()
}
