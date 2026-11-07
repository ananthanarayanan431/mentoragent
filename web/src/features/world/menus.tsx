import { Check, List, Play, Tag } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import type { Mentor } from '@/lib/types'
import { useMediaQuery } from '@/lib/use-media-query'

const CONTROLS: [string, string][] = [
  ['Arrows / WASD', 'Walk'],
  ['Tap or click', 'Walk there (tap a mentor to talk)'],
  ['Space / Enter', 'Talk to the mentor next to you'],
  ['Escape', 'Close a conversation, or open this menu'],
]

function Controls() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-left text-sm">
      {CONTROLS.map(([keys, action]) => (
        <div key={keys} className="contents">
          <dt>
            <kbd className="rounded border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-xs">
              {keys}
            </kbd>
          </dt>
          <dd className="text-muted">{action}</dd>
        </div>
      ))}
    </dl>
  )
}

function Panel({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="w-full max-w-md space-y-5 rounded-xl border-2 border-ink/80 bg-surface p-6 text-center shadow-[0_6px_0_0_rgba(0,0,0,0.3)]"
      >
        {children}
      </div>
    </div>
  )
}

function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => ref.current?.focus(), [])
  return ref
}

export function TitleScreen({
  mentorCount,
  onStart,
}: {
  mentorCount: number
  onStart: () => void
}) {
  const startRef = useAutoFocus<HTMLButtonElement>()
  return (
    <Panel label="Mentor Square">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">MentorAgents</p>
        <h1 className="font-mono text-3xl font-bold">Mentor Square</h1>
        <p className="text-sm text-muted">
          {mentorCount} {mentorCount === 1 ? 'mentor is' : 'mentors are'} strolling around the
          square. Walk up to one and ask them anything.
        </p>
      </div>
      <Controls />
      <div className="flex flex-col items-center gap-3">
        <button
          ref={startRef}
          type="button"
          onClick={onStart}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 font-mono text-sm font-bold uppercase tracking-wide text-on-accent shadow-[0_3px_0_0_rgba(0,0,0,0.25)] hover:bg-accent-hover"
        >
          <Play size={15} aria-hidden="true" />
          Enter the square
        </button>
        <Link to="/mentors" className="text-xs text-muted underline-offset-2 hover:underline">
          Prefer a list? Open the classic view
        </Link>
      </div>
    </Panel>
  )
}

interface PauseProps {
  labelsVisible: boolean
  onToggleLabels: () => void
  onResume: () => void
}

export function PauseMenu({ labelsVisible, onToggleLabels, onResume }: PauseProps) {
  const resumeRef = useAutoFocus<HTMLButtonElement>()
  return (
    <Panel label="Paused">
      <h2 className="font-mono text-2xl font-bold uppercase tracking-wide">Paused</h2>
      <Controls />
      <div className="flex flex-col gap-2">
        <button
          ref={resumeRef}
          type="button"
          onClick={onResume}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-mono text-sm font-bold uppercase text-on-accent hover:bg-accent-hover"
        >
          <Play size={15} aria-hidden="true" />
          Resume
        </button>
        <button
          type="button"
          onClick={onToggleLabels}
          aria-pressed={labelsVisible}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-sm hover:bg-raised"
        >
          <Tag size={15} aria-hidden="true" />
          {labelsVisible ? 'Hide name labels' : 'Show name labels'}
        </button>
        <Link
          to="/mentors"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-sm hover:bg-raised"
        >
          <List size={15} aria-hidden="true" />
          Classic view
        </Link>
      </div>
    </Panel>
  )
}

/** Top-left HUD: who you've met so far. Collapsed to a small badge on narrow screens. */
export function QuestLog({ mentors, met }: { mentors: Mentor[]; met: ReadonlySet<string> }) {
  const wide = useMediaQuery('(min-width: 640px)')
  const [open, setOpen] = useState(wide)
  const count = mentors.filter((mentor) => met.has(mentor.id)).length
  return (
    <aside
      aria-label="Mentors met"
      className="pointer-events-auto absolute left-3 top-3 z-20 rounded-lg border-2 border-ink/70 bg-surface/95 shadow-[0_3px_0_0_rgba(0,0,0,0.25)]"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide ${open ? 'w-56' : ''}`}
      >
        <span>Mentors met</span>
        <span className="text-accent">
          {count}/{mentors.length}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <ul className="space-y-1 text-sm">
            {mentors.map((mentor) => {
              const done = met.has(mentor.id)
              return (
                <li key={mentor.id} className="flex items-center gap-2">
                  <span
                    className={`grid size-4 shrink-0 place-items-center rounded-sm border ${
                      done ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'
                    }`}
                  >
                    {done && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span className={done ? 'text-muted line-through' : ''}>{mentor.name}</span>
                  <span className="sr-only">{done ? '(met)' : '(not met yet)'}</span>
                </li>
              )
            })}
          </ul>
          {count === mentors.length && mentors.length > 0 && (
            <p className="mt-2 font-mono text-xs text-accent">Every mentor met. Nice work!</p>
          )}
        </div>
      )}
    </aside>
  )
}
