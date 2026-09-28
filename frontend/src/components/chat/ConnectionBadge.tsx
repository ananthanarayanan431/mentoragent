import type { SocketStatus } from '../../hooks/useChatSocket'

const LABELS: Record<SocketStatus, { text: string; dot: string; tone: string }> = {
  connecting: { text: 'Connecting', dot: 'bg-faint animate-blink', tone: 'text-faint' },
  open: { text: 'Live', dot: 'bg-positive', tone: 'text-muted' },
  reconnecting: { text: 'Reconnecting', dot: 'bg-accent animate-blink', tone: 'text-muted' },
  offline: { text: 'Offline', dot: 'bg-danger', tone: 'text-danger' },
}

interface Props {
  status: SocketStatus
  onReconnect: () => void
}

/**
 * Connection state for the streaming socket. Offline is not fatal — messages
 * fall back to the plain HTTP endpoint — so the wording stays low-key.
 */
export function ConnectionBadge({ status, onReconnect }: Props) {
  const { text, dot, tone } = LABELS[status]

  return (
    <span className={`flex items-center gap-1.5 text-xs ${tone}`}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span>{text}</span>
      {status === 'offline' && (
        <button
          type="button"
          onClick={onReconnect}
          className="rounded font-medium text-accent underline underline-offset-2"
        >
          Retry
        </button>
      )}
    </span>
  )
}
