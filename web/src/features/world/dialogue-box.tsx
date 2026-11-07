import { ExternalLink, RotateCcw, SendHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link } from 'react-router'

import { Avatar } from '@/components/avatar'
import { MessageBubble } from '@/features/chat/message-bubble'
import { useMentorConversation } from '@/features/chat/use-mentor-conversation'
import { MAX_MESSAGE_CHARS } from '@/lib/config'
import type { Mentor } from '@/lib/types'
import type { Level } from './progress'

interface Props {
  mentor: Mentor
  /** How well the player knows this mentor (friendship level). */
  level: Level
  onClose: () => void
  /** Called once per message the player sends (for the quest log). */
  onMessageSent: () => void
}

/**
 * The in-world conversation: a game-style dialogue box over the bottom of the
 * map. Mount it with `key={mentor.id}`; the conversation is the same one the
 * chat page shows, so the player can continue it there.
 */
export function DialogueBox({ mentor, level, onClose, onMessageSent }: Props) {
  const { state, send, startNewChat } = useMentorConversation(mentor.id)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastContent = state.messages.at(-1)?.content

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Escape closes the conversation from anywhere while it is open. Capture phase,
  // so the game's own Escape (the pause menu) never sees it.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      // Escape during IME composition cancels the composition, not the conversation.
      if (event.key !== 'Escape' || event.isComposing) return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onClose])

  // Keep the newest words in view as the reply streams in.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.messages.length, lastContent])

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (draft.length > MAX_MESSAGE_CHARS) return
    if (send(draft)) {
      setDraft('')
      onMessageSent()
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={`Conversation with ${mentor.name}`}
      className="pointer-events-auto mx-auto flex max-h-[min(62vh,30rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border-2 border-ink/80 bg-surface shadow-[0_6px_0_0_rgba(0,0,0,0.25)]"
    >
      <header className="flex items-center gap-3 border-b-2 border-ink/10 px-4 py-2.5">
        <Avatar name={mentor.name} src={mentor.image_url} size={36} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-mono text-sm font-bold uppercase tracking-wide">
            {mentor.name}
          </h2>
          <p className="truncate text-xs text-muted">{mentor.expertise}</p>
          <div className="mt-1 flex items-center gap-2" title={level.name}>
            <span className="font-mono text-[11px] text-ink">
              Lv {level.level} · {level.name}
            </span>
            <span
              role="progressbar"
              aria-label={`Friendship with ${mentor.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level.progress * 100)}
              className="h-1.5 w-20 overflow-hidden rounded-full bg-raised"
            >
              <span
                className="block h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${Math.round(level.progress * 100)}%` }}
              />
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={startNewChat}
          disabled={state.isStreaming || !state.messages.length}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-raised disabled:opacity-40"
        >
          <RotateCcw size={13} aria-hidden="true" />
          {/* Icon only on phones, so the mentor's name keeps the room. */}
          <span className="sr-only sm:not-sr-only">New chat</span>
        </button>
        <Link
          to={`/chat/${encodeURIComponent(mentor.id)}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-raised"
        >
          <ExternalLink size={13} aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Full chat</span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-md text-muted hover:bg-raised"
        >
          <X size={16} aria-hidden="true" />
          <span className="sr-only">Close (Escape)</span>
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-3"
        aria-live="polite"
      >
        {mentor.memory === 'building' && (
          <p className="rounded-md bg-raised px-3 py-2 text-xs text-muted">
            {mentor.name} just arrived and is still reading up on their own work; answers get richer
            once that is done.
          </p>
        )}
        {mentor.memory === 'failed' && (
          <p className="rounded-md bg-raised px-3 py-2 text-xs text-muted">
            {mentor.name}&rsquo;s background reading failed, so answers draw on general knowledge
            only. It can be rebuilt from the classic view.
          </p>
        )}
        {state.messages.length === 0 ? (
          <p className="font-mono text-sm text-muted">
            {mentor.name} looks up. &ldquo;What would you like to talk about?&rdquo;
          </p>
        ) : (
          state.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              mentorName={mentor.name}
              mentorImage={mentor.image_url}
            />
          ))
        )}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t-2 border-ink/10 p-3">
        <label htmlFor="dialogue-input" className="sr-only">
          Message {mentor.name}
        </label>
        <textarea
          id="dialogue-input"
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Say something to ${mentor.name}…`}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={state.isStreaming || !draft.trim() || draft.length > MAX_MESSAGE_CHARS}
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-40"
        >
          <SendHorizontal size={16} aria-hidden="true" />
          <span className="sr-only">Send</span>
        </button>
      </form>
    </section>
  )
}
