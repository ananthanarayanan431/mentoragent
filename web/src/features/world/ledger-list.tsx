import { X } from 'lucide-react'

import type { LedgerLine } from '@/lib/types'

/** How many pieces of advice the quest log shows. */
export const LEDGER_LINES_SHOWN = 10

interface Props {
  lines: LedgerLine[]
  /** Why forgetting a line failed; empty when it did not. */
  error: string
  onForget: (id: string) => void
}

/** "What they told you": the newest advice every mentor can read, each forgettable. */
export function LedgerList({ lines, error, onForget }: Props) {
  return (
    <section aria-labelledby="ledger-heading" className="border-b border-line pb-3">
      <h3 id="ledger-heading" className="font-mono text-[11px] font-bold uppercase text-muted">
        What they told you
      </h3>
      {lines.length === 0 ? (
        <p className="mt-1 text-xs text-muted">
          Talk to a mentor; their advice shows up here, and the others hear about it.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-2">
          {lines.slice(0, LEDGER_LINES_SHOWN).map((line) => (
            <li key={line.id} className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs">
                  <span className="font-medium">{line.mentor_name}</span>
                  <span className="text-muted"> · {line.topic}</span>
                </p>
                <p className="text-xs text-muted">{line.advice}</p>
              </div>
              <button
                type="button"
                onClick={() => onForget(line.id)}
                aria-label={`Forget this advice from ${line.mentor_name}`}
                title="Forget this advice"
                className="grid size-5 shrink-0 place-items-center rounded text-faint hover:bg-raised hover:text-ink"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
