import { AlertCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

import { useGroupConversation } from '@/features/chat/use-group-conversation'
import { MAX_MESSAGE_CHARS } from '@/lib/config'
import { useMediaQuery } from '@/lib/use-media-query'
import type { Mentor } from '@/lib/types'
import { groupExchange } from './dialogue'
import { FRAME_BUTTON, KeyHints, NamePlate, PlayerLine, Portrait, ScriptLog } from './rpg'
import { SpokenLine } from './spoken-line'
import { useTypewriter } from './use-typewriter'

const NO_PORTRAITS: (string | null)[] = []

interface Props {
  /** The mentor you walked up to (answers first), then the other. */
  mentors: [Mentor, Mentor]
  /** Their sprite portraits, in the same order, once the game has drawn them. */
  portraits?: (string | null)[]
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
  portraits = NO_PORTRAITS,
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

  const speakerIndex = speaker === second.name && question ? 1 : 0
  const speakerMentor = mentors[speakerIndex]

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={`Conversation with ${both}`}
      className="rpg-frame pointer-events-auto relative mx-auto mt-6 mb-2 flex max-h-[min(64vh,32rem)] w-full max-w-3xl flex-col text-ink"
    >
      <NamePlate testId="speaker">{question ? speaker : both}</NamePlate>
      <h2 className="sr-only">{both}</h2>
      <div className="absolute -top-4 right-4 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => setShowLog((open) => !open)}
          disabled={!state.messages.length}
          aria-pressed={showLog}
          className={FRAME_BUTTON}
        >
          Log
        </button>
        <button
          type="button"
          onClick={startNewChat}
          disabled={state.isStreaming || !state.messages.length}
          className={FRAME_BUTTON}
        >
          New chat
        </button>
        <button type="button" onClick={onClose} className={FRAME_BUTTON}>
          <span aria-hidden="true">✕</span>
          <span className="sr-only">Close (Escape)</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-5 pt-6 pb-3">
        {/* Whoever is speaking: both faces until you have asked something. */}
        <div className="flex shrink-0 flex-col gap-2">
          {question ? (
            <Portrait
              name={speakerMentor.name}
              portrait={portraits[speakerIndex]}
              image={speakerMentor.image_url}
              className="size-16 sm:size-24"
            />
          ) : (
            mentors.map((mentor, i) => (
              <Portrait
                key={mentor.id}
                name={mentor.name}
                portrait={portraits[i]}
                image={mentor.image_url}
                className="size-12 sm:size-14"
              />
            ))
          )}
        </div>

        <div className="min-h-28 min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {showLog ? (
            <ScriptLog
              messages={state.messages}
              nameFor={(message) => (message.mentorId && names[message.mentorId]) || 'Mentor'}
            />
          ) : !question ? (
            <ul
              className="space-y-2 font-pixel text-[1.0625rem]"
              aria-label="What they were saying"
            >
              {ambientLines.map((line) => (
                <li key={`${line.mentorId}:${line.text}`}>
                  <span className="text-accent">{names[line.mentorId] ?? 'Mentor'} ▸</span>{' '}
                  {line.text}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <PlayerLine text={question.content} />
              {current?.failed ? (
                <p role="alert" className="flex items-start gap-2 font-pixel text-sm text-danger">
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
      </div>

      <form onSubmit={submit} className="px-5 pb-4">
        <div className="rpg-inset flex items-end gap-2 px-2 py-1">
          <span aria-hidden="true" className="pb-2 font-pixel text-base text-accent">
            ▶
          </span>
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
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 font-pixel text-base outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={state.isStreaming || !draft.trim() || draft.length > MAX_MESSAGE_CHARS}
            className="rpg-plate mb-1.5 h-7 shrink-0 bg-accent px-3 font-pixel text-sm text-on-accent hover:bg-accent-hover disabled:opacity-40"
          >
            Say
          </button>
        </div>
        <KeyHints>
          Enter: say · Space: {finished && hasNext ? 'next speaker' : 'skip'} · Esc: leave
        </KeyHints>
      </form>
    </section>
  )
}
