import { ArrowLeft, List, LogIn, LogOut, Play, Settings, Tag, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { ApiError } from '@/lib/api'
import type { Mentor } from '@/lib/types'

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
        <p className="font-pixel text-xs uppercase tracking-[0.3em] text-accent">MentorAgents</p>
        <h1 className="font-pixel text-3xl font-bold">Mentor Square</h1>
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
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 font-pixel text-sm font-bold uppercase tracking-wide text-on-accent shadow-[0_3px_0_0_rgba(0,0,0,0.25)] hover:bg-accent-hover"
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
  /** Opens the list of mentors to bring into the square or send out. */
  onManageMentors: () => void
}

export function PauseMenu({
  labelsVisible,
  onToggleLabels,
  onResume,
  onManageMentors,
}: PauseProps) {
  const resumeRef = useAutoFocus<HTMLButtonElement>()
  return (
    <Panel label="Paused" onEscape={onResume}>
      <h2 className="font-pixel text-2xl font-bold uppercase tracking-wide">Paused</h2>
      <Controls />
      <div className="flex flex-col gap-2">
        <button
          ref={resumeRef}
          type="button"
          onClick={onResume}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-pixel text-sm font-bold uppercase text-on-accent hover:bg-accent-hover"
        >
          <Play size={15} aria-hidden="true" />
          Resume
        </button>
        <button
          type="button"
          onClick={onManageMentors}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-sm hover:bg-raised"
        >
          <Users size={15} aria-hidden="true" />
          Mentors in the square
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
        <Link
          to="/settings"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-sm hover:bg-raised"
        >
          <Settings size={15} aria-hidden="true" />
          Goal and progress
        </Link>
      </div>
    </Panel>
  )
}

interface SquareMenuProps {
  /** Every mentor you have, in the square or not. */
  mentors: readonly Mentor[]
  /** Brings a mentor in or sends them out; rejects with the reason it failed. */
  onSetInSquare: (mentor: Mentor, inSquare: boolean) => Promise<void>
  onBack: () => void
}

/** Who walks around the square: bring your mentors in or send them out. */
export function SquareMenu({ mentors, onSetInSquare, onBack }: SquareMenuProps) {
  const backRef = useAutoFocus<HTMLButtonElement>()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const sorted = mentors.toSorted(
    (a, b) => Number(b.in_square) - Number(a.in_square) || a.name.localeCompare(b.name),
  )

  async function toggle(mentor: Mentor) {
    setBusy(mentor.id)
    setError('')
    try {
      await onSetInSquare(mentor, !mentor.in_square)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That did not work; try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel label="Mentors in the square" onEscape={onBack}>
      <h2 className="font-pixel text-2xl font-bold uppercase tracking-wide">Mentors</h2>
      <p className="text-sm text-muted">
        Bring your mentors into the square or send them out. They keep their memory either way. New
        mentors are made on the{' '}
        <Link to="/mentors" className="text-accent underline underline-offset-2">
          Mentors page
        </Link>
        .
      </p>
      <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto text-left" aria-label="Your mentors">
        {sorted.map((mentor) => (
          <li
            key={mentor.id}
            className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{mentor.name}</span>
              <span
                className={`block font-pixel text-xs ${mentor.in_square ? 'text-positive' : 'text-faint'}`}
              >
                {mentor.in_square ? 'In the square' : 'Not here'}
                {mentor.memory === 'building' ? ' · still reading up' : ''}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void toggle(mentor)}
              disabled={busy !== null}
              aria-label={`${mentor.in_square ? 'Send out' : 'Bring in'}: ${mentor.name}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-raised disabled:opacity-50"
            >
              {mentor.in_square ? (
                <LogOut size={13} aria-hidden="true" />
              ) : (
                <LogIn size={13} aria-hidden="true" />
              )}
              {busy === mentor.id ? '…' : mentor.in_square ? 'Send out' : 'Bring in'}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        ref={backRef}
        type="button"
        onClick={onBack}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-sm hover:bg-raised"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Back
      </button>
    </Panel>
  )
}
