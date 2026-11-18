import { Check } from 'lucide-react'

import { hasMet, levelFor, type Friendship } from '@/features/world/progress'
import type { Mentor } from '@/lib/types'

interface Props {
  mentors: Mentor[]
  friendship: Friendship
}

/** Every mentor in the square, ticked once you have talked to them, with your level. */
export function MentorsMet({ mentors, friendship }: Props) {
  const count = mentors.filter((mentor) => hasMet(friendship, mentor.id)).length
  return (
    <section aria-labelledby="met-heading" className="space-y-2">
      <h2 id="met-heading" className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs font-bold uppercase text-muted">Mentors met</span>
        <span className="font-mono text-xs text-accent">
          {count}/{mentors.length}
        </span>
      </h2>
      <ul className="space-y-1.5 text-sm">
        {mentors.map((mentor) => {
          const level = levelFor(friendship[mentor.id] ?? 0)
          const met = level.level > 0
          return (
            <li key={mentor.id} className="flex items-center gap-2">
              <span
                className={`grid size-4 shrink-0 place-items-center rounded-sm border ${
                  met ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'
                }`}
              >
                {met && <Check size={11} strokeWidth={3} aria-hidden="true" />}
              </span>
              <span className={`min-w-0 flex-1 truncate ${met ? '' : 'text-muted'}`}>
                {mentor.name}
              </span>
              {met ? (
                <span
                  title={level.name}
                  className="shrink-0 rounded bg-raised px-1.5 font-mono text-[11px] text-ink"
                >
                  Lv {level.level} · {level.name}
                </span>
              ) : null}
              <span className="sr-only">
                {met ? `(met, level ${level.level}: ${level.name})` : '(not met yet)'}
              </span>
            </li>
          )
        })}
      </ul>
      {count === mentors.length && mentors.length > 0 && (
        <p className="font-mono text-xs text-accent">Every mentor met. Nice work!</p>
      )}
    </section>
  )
}
