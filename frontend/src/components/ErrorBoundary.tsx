import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

import { ErrorState } from './StateViews'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defence: a render error anywhere below shows a recoverable
 * message instead of a blank page. Must be a class — React has no hook for this.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <ErrorState
          title="Something broke"
          description={this.state.error.message || 'An unexpected error occurred.'}
          onRetry={() => window.location.reload()}
        />
      </div>
    )
  }
}
