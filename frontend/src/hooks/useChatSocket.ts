/**
 * The chat WebSocket: one long-lived connection per mentor, reconnecting with
 * exponential backoff when it drops.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { API_PREFIX, wsUrl } from '../lib/config'
import { parseServerEvent } from '../lib/chat-state'
import type { ChatRequest, ServerEvent } from '../types'

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'offline'

const MAX_RETRY_DELAY_MS = 30_000
const BASE_RETRY_DELAY_MS = 500
/** After this many failures the socket is declared offline and left alone. */
const MAX_ATTEMPTS = 6

/** Exponential backoff with jitter, so reconnects don't arrive in lockstep. */
function retryDelay(attempt: number): number {
  const capped = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** attempt)
  return capped / 2 + Math.random() * (capped / 2)
}

interface Options {
  /** Called for every well-formed event the server sends. */
  onEvent: (event: ServerEvent) => void
  /** Called when the connection is lost while a reply was streaming. */
  onDropped?: () => void
}

export interface ChatSocket {
  status: SocketStatus
  /** Sends a turn. Returns false when the socket is not open. */
  send: (request: ChatRequest) => boolean
  /** Retry now, resetting the backoff (for a "Reconnect" button). */
  reconnect: () => void
}

export function useChatSocket({ onEvent, onDropped }: Options): ChatSocket {
  const [status, setStatus] = useState<SocketStatus>('connecting')

  const socketRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)
  const closedByUsRef = useRef(false)
  // A pending turn is one where we sent a message and are awaiting `end`.
  const awaitingReplyRef = useRef(false)

  // Held in refs so a changing callback identity never reopens the socket.
  const onEventRef = useRef(onEvent)
  const onDroppedRef = useRef(onDropped)
  useEffect(() => {
    onEventRef.current = onEvent
    onDroppedRef.current = onDropped
  })

  // Lets `connect` schedule a retry of itself without referencing its own
  // binding while that binding is still being initialised.
  const connectRef = useRef<() => void>(() => {})

  const connect = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    socketRef.current?.close()

    let socket: WebSocket
    try {
      socket = new WebSocket(wsUrl(`${API_PREFIX}/ws/chat`))
    } catch {
      setStatus('offline')
      return
    }
    socketRef.current = socket
    setStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting')

    socket.onopen = () => {
      attemptRef.current = 0
      setStatus('open')
    }

    socket.onmessage = (message: MessageEvent<unknown>) => {
      const event = parseServerEvent(message.data)
      if (!event) return
      if (event.type === 'end' || event.type === 'error') awaitingReplyRef.current = false
      onEventRef.current(event)
    }

    // `onerror` is always followed by `onclose`, so retrying is handled there.
    socket.onclose = () => {
      if (socketRef.current !== socket) return
      socketRef.current = null
      if (closedByUsRef.current) return

      // A drop mid-turn means no `end` is coming; let the UI settle the reply.
      if (awaitingReplyRef.current) {
        awaitingReplyRef.current = false
        onDroppedRef.current?.()
      }

      if (attemptRef.current >= MAX_ATTEMPTS) {
        setStatus('offline')
        return
      }
      const delay = retryDelay(attemptRef.current)
      attemptRef.current += 1
      setStatus('reconnecting')
      timerRef.current = setTimeout(() => connectRef.current(), delay)
    }
  }, [])

  useEffect(() => {
    connectRef.current = connect
    closedByUsRef.current = false
    // set-state-in-effect: opening the socket is exactly the case effects are
    // for — synchronising with an external system — and the status it sets is
    // that system's state, which cannot be derived during render.
    // oxlint-disable-next-line react/set-state-in-effect
    connect()
    return () => {
      closedByUsRef.current = true
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [connect])

  const send = useCallback((request: ChatRequest): boolean => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(request))
    awaitingReplyRef.current = true
    return true
  }, [])

  const reconnect = useCallback(() => {
    attemptRef.current = 0
    connect()
  }, [connect])

  return { status, send, reconnect }
}
