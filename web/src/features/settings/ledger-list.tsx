import { ScrollText, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

import { Portrait } from '@/features/world/rpg'
import { timeAgo } from '@/lib/format'
import type { LedgerLine } from '@/lib/types'
import { SectionHeading, type PortraitFor } from './section'

/** How many pieces of advice show before "Show all". */
export const LEDGER_LINES_SHOWN = 10

interface Props {
  lines: LedgerLine[]
  /** Why forgetting a line failed; empty when it did not. */
  error: string
  onForget: (id: string) => void
  portraitFor?: PortraitFor
}

/**
 * "What they told you": the advice every mentor can read, newest first, as cards
 * you can filter by mentor. Forgetting a line means no mentor brings it up again.
 */
export function LedgerList({ lines, error, onForget, portraitFor = null }: Props) {
  const [mentorId, setMentorId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const byMentor = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>()
    for (const line of lines) {
      const entry = counts.get(line.mentor_id)
      if (entry) entry.count += 1
      else counts.set(line.mentor_id, { id: line.mentor_id, name: line.mentor_name, count: 1 })
    }
    return [...counts.values()]
  }, [lines])

  // A filter whose mentor has no lines left (all forgotten) falls back to everyone.
  const active = byMentor.some((mentor) => mentor.id === mentorId) ? mentorId : null
  const filtered = active ? lines.filter((line) => line.mentor_id === active) : lines
  const shown = showAll ? filtered : filtered.slice(0, LEDGER_LINES_SHOWN)

  return (
    <section aria-labelledby="ledger-heading" className="space-y-3">
      <SectionHeading id="ledger-heading" title="What they told you">
        {lines.length > 0 && (
          <span className="font-pixel text-sm text-muted">
            {lines.length} {lines.length === 1 ? 'note' : 'notes'}
          </span>
        )}
      </SectionHeading>

      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
          <ScrollText size={28} aria-hidden="true" className="text-faint" />
          <p className="font-pixel text-base text-ink">Nothing noted yet</p>
          <p className="max-w-sm text-sm text-muted">
            Talk to a mentor; their advice shows up here, and the others hear about it.
          </p>
        </div>
      ) : (
        <>
          {byMentor.length > 1 && (
            <div role="group" aria-label="Show advice from" className="flex flex-wrap gap-2">
              <Chip pressed={active === null} onClick={() => setMentorId(null)}>
                Everyone <Count n={lines.length} />
              </Chip>
              {byMentor.map((mentor) => (
                <Chip
                  key={mentor.id}
                  pressed={active === mentor.id}
                  onClick={() => setMentorId(mentor.id)}
                >
                  {mentor.name} <Count n={mentor.count} />
                </Chip>
              ))}
            </div>
          )}

          <ul className="space-y-2.5">
            {shown.map((line) => (
              <li
                key={line.id}
                className="group flex gap-3 rounded-xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong"
              >
                <Portrait
                  name={line.mentor_name}
                  portrait={portraitFor?.(line.mentor_id)}
                  className="size-10"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink first-letter:uppercase">{line.topic}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink/80">{line.advice}</p>
                  <p className="mt-1.5 text-xs text-faint">
                    <span className="text-muted">{line.mentor_name}</span>
                    {timeAgo(line.created_at) && <> · {timeAgo(line.created_at)}</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onForget(line.id)}
                  aria-label={`Forget this advice from ${line.mentor_name}`}
                  title="Forget this advice"
                  className="grid size-7 shrink-0 place-items-center rounded-md text-faint transition-opacity hover:bg-raised hover:text-ink focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          {filtered.length > LEDGER_LINES_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll((all) => !all)}
              className="w-full rounded-xl border border-line py-2 font-pixel text-sm text-muted hover:bg-raised hover:text-ink"
            >
              {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
            </button>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm text-muted hover:border-line-strong hover:text-ink aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-ink"
    >
      {children}
    </button>
  )
}

function Count({ n }: { n: number }) {
  return <span className="font-pixel text-xs text-faint">{n}</span>
}
