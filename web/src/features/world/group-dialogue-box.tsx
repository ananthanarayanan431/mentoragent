import { AlertCircle, RotateCcw, ScrollText, SendHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

import { Avatar } from '@/components/avatar'
import { MessageBubble } from '@/features/chat/message-bubble'
import { useGroupConversation } from '@/features/chat/use-group-conversation'
import { MAX_MESSAGE_CHARS } from '@/lib/config'
import { useMediaQuery } from '@/lib/use-media-query'
import type { Mentor } from '@/lib/types'
import { groupExchange } from './dialogue'
import { SpokenLine } from './spoken-line'
import { useTypewriter } from './use-typewriter'

interface Props {
  /** The mentor you walked up to (answers first), then the other. */
  mentors: [Mentor, Mentor]
  /** The chat you joined, so both mentors remember it. */
  ambientId: string | null
  /** What they were saying when you joined. */
  ambientLines: { mentorId: string; text: string }[]
  onClose: () => void
  /** Called once per message you send (friendship counts for both). */
  onMessageSent: () => void
}

/**
 * A conversation with two mentors, joined in the square: each message gets a reply
 * from both, shown one speaker at a time (Space moves on, as in an RPG text box).
 */
export function GroupDialogueBox({
  mentors,
  ambientId,
  ambientLines,
  onClose,
  onMessageSent,
}: Props) {
  const [first, second] = mentors
  const { state, send, startNewChat } = useGroupConversation([first.id, second.id], ambientId)
  const [draft, setDraft] = useState('')
  const [showLog, setShowLog] = useState(false)
  const [step, setStep] = useState({ questionId: '', shown: 0 })
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const names = { [first.id]: first.name, [second.id]: second.name }
  const both = `${first.name} and ${second.name}`

  const { question, replies } = groupExchange(state.messages)
  const questionId = question?.id ?? ''
  // A new question starts from its first reply (state adjusted during render).
  let shown = step.shown
  if (step.questionId !== questionId) {
    shown = 0
    setStep({ questionId, shown: 0 })
  }
  const current = replies[shown]
  const [readBefore] = useState(() => new Set(state.messages.map((m) => m.id)))
  const typewriter = useTypewriter(
    current?.content ?? '',
    current?.id ?? `waiting-${shown}`,
    reducedMotion || (current !== undefined && readBefore.has(current.id)),
  )
  const streaming = current?.streaming ?? false
  const finished = current !== undefined && typewriter.done && !streaming
  const hasNext = shown + 1 < replies.length || (state.isStreaming && shown === 0)
  const speaker = current?.mentorId
    ? names[current.mentorId]
    : shown === 0
      ? first.name
      : second.name

  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing) return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onClose])

  /** Space or a click: finish the line, or move on to the next speaker. */
  function hurry() {
    if (!typewriter.done) typewriter.skip()
    else if (finished && hasNext) setStep({ questionId, shown: shown + 1 })
  }

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (draft.length > MAX_MESSAGE_CHARS || !send(draft)) return
    setDraft('')
    setShowLog(false)
    onMessageSent()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    } else if (event.key === ' ' && draft === '' && question) {
      event.preventDefault()
      hurry()
    }
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={`Conversation with ${both}`}
      className="pointer-events-auto relative mx-auto mt-4 flex max-h-[min(62vh,30rem)] w-full max-w-3xl flex-col rounded-xl border-2 border-ink/80 bg-surface shadow-[0_6px_0_0_rgba(0,0,0,0.25)]"
    >
      <span
        data-testid="speaker"
        className="absolute -top-3.5 left-4 rounded-md border-2 border-ink/80 bg-accent px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wide text-on-accent"
      >
        {question ? speaker : both}
      </span>

      <header className="flex items-center gap-2 border-b-2 border-ink/10 px-4 pt-4 pb-2.5">
        <Avatar name={first.name} src={first.image_url} size={32} />
        <Avatar name={second.name} src={second.image_url} size={32} />
        <h2 className="min-w-0 flex-1 truncate text-xs text-muted">{both}</h2>
        <button
          type="button"
          onClick={() => setShowLog((open) => !open)}
          disabled={!state.messages.length}
          aria-pressed={showLog}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-raised disabled:opacity-40"
        >
          <ScrollText size={13} aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Log</span>
        </button>
        <button
          type="button"
          onClick={startNewChat}
          disabled={state.isStreaming || !state.messages.length}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-raised disabled:opacity-40"
        >
          <RotateCcw size={13} aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">New chat</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-md text-muted hover:bg-raised"
        >
          <X size={16} aria-hidden="true" />
          <span className="sr-only">Close (Escape)</span>
        </button>
      </header>

      <div className="min-h-32 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {showLog ? (
          <div className="space-y-4" aria-label="Conversation log">
            {state.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                mentorName={(message.mentorId && names[message.mentorId]) || 'Mentor'}
                mentorImage={message.mentorId === first.id ? first.image_url : second.image_url}
              />
            ))}
          </div>
        ) : !question ? (
          <ul className="space-y-1.5 text-sm" aria-label="What they were saying">
            {ambientLines.map((line) => (
              <li key={`${line.mentorId}:${line.text}`}>
                <span className="font-mono text-xs font-bold">
                  {names[line.mentorId] ?? 'Mentor'}:
                </span>{' '}
                {line.text}
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-xs text-muted">
              <span className="font-bold text-ink">You:</span> {question.content}
            </p>
            {current?.failed ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {current.content}
              </p>
            ) : (
              <SpokenLine
                shown={typewriter.shown}
                thinking={!current || (streaming && current.content.length === 0)}
                revealing={!typewriter.done || streaming}
                finished={finished && hasNext}
                onSkip={hurry}
              />
            )}
            <p className="sr-only" aria-live="polite">
              {finished && current && !current.failed ? `${speaker}: ${current.content}` : ''}
            </p>
          </>
        )}
      </div>

      <form onSubmit={submit} className="border-t-2 border-ink/10 p-3">
        <div className="flex items-end gap-2">
          <label htmlFor="group-input" className="sr-only">
            Message {both}
          </label>
          <textarea
            id="group-input"
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Say something to ${both}…`}
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
        </div>
        <p className="mt-1.5 hidden font-mono text-[11px] text-faint sm:block">
          Enter: send · Space: {finished && hasNext ? 'next speaker' : 'skip'} · Esc: leave
        </p>
      </form>
    </section>
  )
}
