import {
  hasMet,
  LEVEL_NAMES,
  levelFor,
  MAX_LEVEL,
  type Friendship,
} from '@/features/world/progress'
import { Portrait } from '@/features/world/rpg'
import type { Mentor } from '@/lib/types'
import { SectionHeading, type PortraitFor } from './section'

interface Props {
  mentors: Mentor[]
  friendship: Friendship
  portraitFor: PortraitFor
}

/**
 * Every mentor in the square as a card: their portrait, what they know, and how
 * far your friendship has come (or a nudge to go and find them).
 */
export function MentorsMet({ mentors, friendship, portraitFor }: Props) {
  const count = mentors.filter((mentor) => hasMet(friendship, mentor.id)).length
  const all = count === mentors.length && mentors.length > 0
  return (
    <section aria-labelledby="met-heading" className="space-y-3">
      <SectionHeading id="met-heading" title="Mentors met">
        <span className="font-pixel text-sm text-muted">
          <span className="text-accent">
            {count}/{mentors.length}
          </span>
          {all ? ' · all met' : ' met'}
        </span>
      </SectionHeading>
      <Meter value={mentors.length ? count / mentors.length : 0} label="Mentors met" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {mentors.map((mentor) => (
          <MentorCard
            key={mentor.id}
            mentor={mentor}
            messages={friendship[mentor.id] ?? 0}
            portrait={portraitFor?.(mentor.id)}
          />
        ))}
      </ul>
    </section>
  )
}

function MentorCard({
  mentor,
  messages,
  portrait,
}: {
  mentor: Mentor
  messages: number
  portrait: string | null | undefined
}) {
  const level = levelFor(messages)
  const met = level.level > 0
  const next = LEVEL_NAMES[level.level + 1]
  return (
    <li
      className={`flex gap-3 rounded-xl border p-3 ${
        met ? 'border-line bg-surface' : 'border-dashed border-line-strong bg-canvas'
      }`}
    >
      <Portrait
        name={mentor.name}
        portrait={portrait}
        image={mentor.image_url}
        className={`size-14 ${met ? '' : 'opacity-50 grayscale'}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`truncate font-medium ${met ? 'text-ink' : 'text-muted'}`}>
            {mentor.name}
          </span>
          <span className="sr-only">
            {met ? `(met, level ${level.level}: ${level.name})` : '(not met yet)'}
          </span>
        </div>
        <p className="truncate text-xs text-muted">{mentor.expertise}</p>
        {met ? (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <span className="rpg-plate bg-accent px-1.5 font-pixel text-[11px] leading-4 text-on-accent">
                Lv {level.level}
              </span>
              <span className="font-pixel text-sm text-ink">{level.name}</span>
            </div>
            <Meter value={level.progress} label={`Friendship with ${mentor.name}`} small />
            <p className="text-[11px] text-faint">
              {level.level === MAX_LEVEL || !next
                ? 'Top level reached'
                : `${level.toNext} more ${level.toNext === 1 ? 'message' : 'messages'} to ${next}`}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-faint">Not met yet. Find them in the square.</p>
        )}
      </div>
    </li>
  )
}

/** A pixel progress bar, 0 to 1. */
function Meter({ value, label, small = false }: { value: number; label: string; small?: boolean }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={`rpg-inset overflow-hidden ${small ? 'h-1.5' : 'h-2'}`}
    >
      <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  )
}
