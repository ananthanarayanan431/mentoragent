import { Check, List, Play, Tag } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import type { Mentor } from '@/lib/types'
import { useMediaQuery } from '@/lib/use-media-query'
import { hasMet, levelFor, type Friendship } from './progress'

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

interface PanelProps {
  children: React.ReactNode
  label: string
  /** Escape does this (the pause menu resumes); without it Escape does nothing. */
  onEscape?: () => void
}

/**
 * A modal menu over the game. Being modal, it keeps keyboard focus inside itself
 * (Tab and Shift+Tab cycle through its controls) and handles Escape.
 */
function Panel({ children, label, onEscape }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      const panel = ref.current
      if (!panel) return
      if (event.key === 'Escape') {
        // Capture phase, so the game never sees this Escape and reopens the menu.
        event.stopPropagation()
        onEscape?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...panel.querySelectorAll<HTMLElement>('button, a[href]')]
      if (!focusable.length) return
      const first = focusable[0]!
      const last = focusable.at(-1)!
      const inside = panel.contains(document.activeElement)
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onEscape])

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div
        ref={ref}
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
    <Panel label="Paused" onEscape={onResume}>
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

/** Top-left HUD: who you have met, and how well you know them. */
export function QuestLog({ mentors, friendship }: { mentors: Mentor[]; friendship: Friendship }) {
  const wide = useMediaQuery('(min-width: 640px)')
  const [open, setOpen] = useState(wide)
  const count = mentors.filter((mentor) => hasMet(friendship, mentor.id)).length
  return (
    <aside
      aria-label="Mentors met"
      className="pointer-events-auto absolute left-3 top-3 z-20 max-h-[calc(100%-5rem)] overflow-y-auto rounded-lg border-2 border-ink/70 bg-surface/95 shadow-[0_3px_0_0_rgba(0,0,0,0.25)]"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide ${open ? 'w-60' : ''}`}
      >
        <span>Mentors met</span>
        <span className="text-accent">
          {count}/{mentors.length}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
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
                      Lv {level.level}
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
            <p className="mt-2 font-mono text-xs text-accent">Every mentor met. Nice work!</p>
          )}
        </div>
      )}
    </aside>
  )
}
