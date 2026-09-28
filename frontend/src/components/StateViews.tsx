/** Shared loading, empty and error placeholders. */

import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-block size-4 animate-spin rounded-full border-2 border-line border-t-accent"
    />
  )
}

/** Placeholder card shown while the mentor list loads. */
export function MentorCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <div className="size-12 animate-pulse rounded-full bg-raised" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-raised" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-raised" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-raised" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-raised" />
      </div>
    </div>
  )
}

interface ErrorStateProps {
  title: string
  description: string
  onRetry?: () => void
  retrying?: boolean
}

export function ErrorState({ title, description, onRetry, retrying }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-lg rounded-2xl border border-line bg-surface p-8 text-center"
    >
      <span className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle size={20} aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} aria-hidden="true" />
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  description: string
  icon: ReactNode
  children?: ReactNode
}

export function EmptyState({ title, description, icon, children }: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center">
      <span className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-raised text-faint">
        {icon}
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{description}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}
