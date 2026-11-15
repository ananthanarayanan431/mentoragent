import { AlertCircle, ExternalLink, RotateCcw, ScrollText, SendHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import Markdown from 'react-markdown'
import { Link } from 'react-router'
import remarkGfm from 'remark-gfm'

import { Avatar } from '@/components/avatar'
import { Spinner } from '@/components/state-views'
import { MessageBubble } from '@/features/chat/message-bubble'
import { useMentorConversation } from '@/features/chat/use-mentor-conversation'
import { MAX_MESSAGE_CHARS } from '@/lib/config'
import { useMediaQuery } from '@/lib/use-media-query'
import type { Mentor } from '@/lib/types'
import { currentExchange } from './dialogue'
import type { Level } from './progress'
import { useTypewriter } from './use-typewriter'

interface Props {
  mentor: Mentor
  /** How well the player knows this mentor (friendship level). */
  level: Level
  onClose: () => void
  /** Called once per message the player sends (for the quest log). */
  onMessageSent: () => void
}

/**
 * The in-world conversation: an RPG text box over the bottom of the map. It
 * shows one exchange at a time, the mentor's reply typing itself out (Space
 * skips ahead); the whole conversation is in the log. Mount it with
 * `key={mentor.id}`; the conversation is the same one the chat page shows.
 */
export function DialogueBox({ mentor, level, onClose, onMessageSent }: Props) {
  const { state, send, requestOpener, startNewChat } = useMentorConversation(mentor.id)
  const [draft, setDraft] = useState('')
  const [showLog, setShowLog] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  // Until the memory is built the persona may be a placeholder and no source is
  // searchable, so the agent refuses the turn; say why instead of letting it fail.
  const locked = mentor.memory === 'building'

  // Lines already finished when the box opened were read before: no retyping.
  const [readBefore] = useState(
    () => new Set(state.messages.filter((m) => !m.streaming).map((m) => m.id)),
  )
  const { question, reply } = currentExchange(state.messages)
  const greeting = `${mentor.name} looks up. “What would you like to talk about?”`
  const lineKey = reply?.id ?? (question ? 'waiting' : 'greeting')
  const lineText = reply ? reply.content : question ? '' : greeting
  const typewriter = useTypewriter(
    lineText,
    lineKey,
    reducedMotion || (reply !== null && readBefore.has(reply.id)),
  )
  const revealing = !typewriter.done
  const thinking = (reply?.streaming ?? false) && reply?.content.length === 0
  const finished = typewriter.done && !(reply?.streaming ?? false)

  // Walking up to a mentor: they may speak first with what they heard from the
  // others. Asked once, as soon as they can talk (a ref, so a remount in strict mode
  // does not ask twice).
  const askedOpener = useRef(false)
  useEffect(() => {
    if (locked || askedOpener.current) return
    askedOpener.current = true
    requestOpener()
  }, [locked, requestOpener])

  // Focus on open, and again when the memory finishes (a disabled box loses focus).
  useEffect(() => {
    if (!locked) inputRef.current?.focus()
  }, [locked])

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

  // Keep the newest words in view as the reply types out (and at the end of the log).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [typewriter.shown, showLog, state.messages.length])

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (locked || draft.length > MAX_MESSAGE_CHARS) return
    if (send(draft)) {
      setDraft('')
      setShowLog(false)
      onMessageSent()
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    } else if (event.key === ' ' && draft === '' && revealing) {
      // Like an RPG: Space hurries the line along. Only on an empty box, so
      // typing a message is never interrupted.
      event.preventDefault()
      typewriter.skip()
    }
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={`Conversation with ${mentor.name}`}
      className="pointer-events-auto relative mx-auto mt-4 flex max-h-[min(62vh,30rem)] w-full max-w-3xl flex-col rounded-xl border-2 border-ink/80 bg-surface shadow-[0_6px_0_0_rgba(0,0,0,0.25)]"
    >
      {/* Name plate on the frame, as in a classic RPG text box. */}
      <span
        aria-hidden="true"
        className="absolute -top-3.5 left-4 rounded-md border-2 border-ink/80 bg-accent px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wide text-on-accent shadow-[0_2px_0_0_rgba(0,0,0,0.25)]"
      >
        {mentor.name}
      </span>

      <header className="flex items-center gap-3 border-b-2 border-ink/10 px-4 pt-4 pb-2.5">
        <Avatar name={mentor.name} src={mentor.image_url} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="sr-only">{mentor.name}</h2>
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
          onClick={() => setShowLog((open) => !open)}
          disabled={!state.messages.length}
          aria-pressed={showLog}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-raised disabled:opacity-40 ${
            showLog ? 'bg-raised text-ink' : 'text-muted'
          }`}
        >
          <ScrollText size={13} aria-hidden="true" />
          {/* Icon only on phones, so the header keeps its room. */}
          <span className="sr-only sm:not-sr-only">Log</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setShowLog(false)
            startNewChat()
          }}
          disabled={state.isStreaming || !state.messages.length}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-raised disabled:opacity-40"
        >
          <RotateCcw size={13} aria-hidden="true" />
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

      <div ref={scrollRef} className="min-h-32 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {locked && (
          <p className="flex items-center gap-2 rounded-md bg-raised px-3 py-2 text-xs text-muted">
            <Spinner label="Building memory" />
            {mentor.name} is still reading up on their own work. You can talk once they are done;
            this usually takes a minute or two.
          </p>
        )}
        {mentor.memory === 'failed' && (
          <p className="rounded-md bg-raised px-3 py-2 text-xs text-muted">
            {mentor.name}&rsquo;s background reading failed, so answers draw on general knowledge
            only. It can be rebuilt from the classic view.
          </p>
        )}

        {showLog ? (
          <div className="space-y-4" aria-label="Conversation log">
            {state.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                mentorName={mentor.name}
                mentorImage={mentor.image_url}
              />
            ))}
          </div>
        ) : (
          <>
            {question && (
              <p className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-xs text-muted">
                <span className="font-bold text-ink">You:</span> {question.content}
              </p>
            )}
            {reply?.failed ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {reply.content}
              </p>
            ) : (
              <SpokenLine
                shown={typewriter.shown}
                thinking={thinking || (question !== null && reply === null)}
                revealing={revealing || (reply?.streaming ?? false)}
                finished={finished}
                onSkip={typewriter.skip}
              />
            )}
            {/* The visible line types out character by character; screen readers
                get it once, whole, when it is finished. */}
            <p className="sr-only" aria-live="polite">
              {finished && reply && !reply.failed ? reply.content : ''}
            </p>
          </>
        )}
      </div>

      <form onSubmit={submit} className="border-t-2 border-ink/10 p-3">
        <div className="flex items-end gap-2">
          <span aria-hidden="true" className="pb-2 font-mono text-sm font-bold text-accent">
            &gt;
          </span>
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
            disabled={locked}
            placeholder={
              locked ? `${mentor.name} is still reading up…` : `Say something to ${mentor.name}…`
            }
            aria-describedby="dialogue-keys"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={
              locked || state.isStreaming || !draft.trim() || draft.length > MAX_MESSAGE_CHARS
            }
            className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-40"
          >
            <SendHorizontal size={16} aria-hidden="true" />
            <span className="sr-only">Send</span>
          </button>
        </div>
        <p id="dialogue-keys" className="mt-1.5 hidden font-mono text-[11px] text-faint sm:block">
          Enter: send · Shift+Enter: new line
          {revealing && !showLog ? ' · Space: skip' : ''} · Esc: leave
        </p>
      </form>
    </section>
  )
}

interface SpokenLineProps {
  shown: string
  /** The mentor is working on a reply and has not said anything yet. */
  thinking: boolean
  /** More of the line is still coming (typing out or streaming in). */
  revealing: boolean
  /** The whole line is on screen: show the "continue" marker. */
  finished: boolean
  onSkip: () => void
}

/** The mentor's current line, typing itself out; a click shows the rest at once. */
function SpokenLine({ shown, thinking, revealing, finished, onSkip }: SpokenLineProps) {
  if (thinking) {
    return (
      <p className="flex items-center gap-1.5 py-2" aria-label="Thinking">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2 animate-blink rounded-full bg-faint"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </p>
    )
  }

  return (
    <div
      aria-hidden="true"
      onClick={revealing ? onSkip : undefined}
      className={`relative pb-4 ${revealing ? 'cursor-pointer' : ''}`}
    >
      <div className="prose-reply break-words text-base leading-relaxed">
        <Markdown remarkPlugins={[remarkGfm]}>{shown}</Markdown>
      </div>
      {revealing && (
        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-blink bg-accent" />
      )}
      {finished && (
        <span className="absolute right-0 bottom-0 animate-blink font-mono text-xs text-accent">
          ▼
        </span>
      )}
    </div>
  )
}
