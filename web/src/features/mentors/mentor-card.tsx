import { ArrowRight, MoreHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'

import { Avatar } from '@/components/avatar'
import { ApiError } from '@/lib/api'
import type { Mentor } from '@/lib/types'

interface Props {
  mentor: Mentor
  /** Removes the mentor; without it the card has no menu. Rejects with the reason it failed. */
  onRemove?: (mentor: Mentor) => Promise<void>
}

export function MentorCard({ mentor, onRemove }: Props) {
  return (
    <div className="group relative flex flex-col rounded-2xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg hover:shadow-black/5">
      <Link to={`/chat/${encodeURIComponent(mentor.id)}`} className="flex flex-1 flex-col p-5">
        <div className={`flex items-center gap-3 ${onRemove ? 'pr-8' : ''}`}>
          <Avatar name={mentor.name} src={mentor.image_url} size={48} />
          <div className="min-w-0">
            <h2 className="truncate font-semibold tracking-tight">{mentor.name}</h2>
            <p className="truncate text-sm text-muted">{mentor.expertise}</p>
          </div>
        </div>

        <p className="mt-4 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">
          {mentor.perspective}
        </p>

        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
          Start a conversation
          <ArrowRight
            size={15}
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </Link>

      {onRemove && <CardMenu mentor={mentor} onRemove={onRemove} />}
    </div>
  )
}

/** The "⋯" menu, outside the link (a button inside a link is invalid), and the remove confirmation. */
function CardMenu({
  mentor,
  onRemove,
}: {
  mentor: Mentor
  onRemove: (mentor: Mentor) => Promise<void>
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const building = mentor.memory === 'building'

  // Close the menu on a click outside it or on Escape.
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  async function remove() {
    setError('')
    setBusy(true)
    try {
      await onRemove(mentor)
      // On success the page drops this card, so nothing to reset.
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The mentor could not be removed.')
      setBusy(false)
    }
  }

  return (
    <>
      <div ref={menuRef} className="absolute right-3 top-3">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink"
        >
          <MoreHorizontal size={16} aria-hidden="true" />
          <span className="sr-only">More options for {mentor.name}</span>
        </button>

        {menuOpen && (
          <div
            id={menuId}
            role="menu"
            aria-label={`Options for ${mentor.name}`}
            className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-line bg-surface p-1 shadow-lg shadow-black/10"
          >
            <button
              type="button"
              role="menuitem"
              disabled={building}
              title={building ? 'Wait for the memory build to finish' : undefined}
              onClick={() => {
                setMenuOpen(false)
                setConfirming(true)
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-danger hover:bg-danger-soft disabled:opacity-50"
            >
              <Trash2 size={14} aria-hidden="true" />
              Remove mentor
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-label={`Remove ${mentor.name}?`}
          className="absolute inset-0 z-20 flex flex-col justify-center gap-3 rounded-2xl bg-surface p-5"
        >
          <p className="text-sm">
            Remove <span className="font-semibold">{mentor.name}</span>? Their memory is deleted
            too. You can add them back later with &ldquo;Add a random mentor&rdquo;.
          </p>
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-50"
            >
              {busy ? 'Removing…' : 'Remove'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false)
                setError('')
              }}
              disabled={busy}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-raised"
            >
              Keep
            </button>
          </div>
        </div>
      )}
    </>
  )
}
