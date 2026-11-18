import { AlertCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link } from 'react-router'

import { Spinner } from '@/components/state-views'
import { useMentorConversation } from '@/features/chat/use-mentor-conversation'
import { MAX_MESSAGE_CHARS } from '@/lib/config'
import { useMediaQuery } from '@/lib/use-media-query'
import type { Mentor } from '@/lib/types'
import { currentExchange, splitPages } from './dialogue'
import { SpokenLine } from './spoken-line'
import type { Level } from './progress'
import { FRAME_BUTTON, KeyHints, NamePlate, PlayerLine, Portrait, ScriptLog } from './rpg'
import { useTypewriter } from './use-typewriter'

interface Props {
  mentor: Mentor
  /** How well the player knows this mentor (friendship level). */
  level: Level
  /** Their sprite's head and shoulders (data URL), once the game has drawn it. */
  portrait?: string | null | undefined
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
export function DialogueBox({ mentor, level, portrait, onClose, onMessageSent }: Props) {
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

  // A long reply reads a page at a time, like an RPG text box; Space turns the page.
  const pages = splitPages(lineText)
  const [paging, setPaging] = useState({ key: lineKey, index: 0 })
  let pageIndex = paging.key === lineKey ? paging.index : 0
  if (paging.key !== lineKey) setPaging({ key: lineKey, index: 0 })
  pageIndex = Math.min(pageIndex, pages.length - 1)
  const hasNextPage = pageIndex < pages.length - 1
  const turnPage = () => setPaging({ key: lineKey, index: pageIndex + 1 })

  const typewriter = useTypewriter(
    pages[pageIndex] ?? '',
    `${lineKey}#${pageIndex}`,
    reducedMotion || (reply !== null && readBefore.has(reply.id)),
  )
  const streaming = reply?.streaming ?? false
  const revealing = !typewriter.done
  const thinking = streaming && reply?.content.length === 0
  const pageDone = typewriter.done && hasNextPage
  const finished = typewriter.done && !hasNextPage && !streaming

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
    } else if (event.key === ' ' && draft === '' && (revealing || pageDone)) {
      // Like an RPG: Space hurries the line along, then turns the page. Only on
      // an empty box, so typing a message is never interrupted.
      event.preventDefault()
      if (revealing) typewriter.skip()
      else turnPage()
    }
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={`Conversation with ${mentor.name}`}
      className="rpg-frame pointer-events-auto relative mx-auto mt-6 mb-2 flex max-h-[min(64vh,32rem)] w-full max-w-3xl flex-col text-ink"
    >
      {/* Name plate and buttons sit on the frame, as in a classic RPG text box. */}
      <NamePlate>{mentor.name}</NamePlate>
      <h2 className="sr-only">{mentor.name}</h2>
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
          onClick={() => {
            setShowLog(false)
            startNewChat()
          }}
          disabled={state.isStreaming || !state.messages.length}
          className={FRAME_BUTTON}
        >
          New chat
        </button>
        <Link
          to={`/chat/${encodeURIComponent(mentor.id)}`}
          className={`${FRAME_BUTTON} max-sm:hidden`}
        >
          Full chat
        </Link>
        <button type="button" onClick={onClose} className={FRAME_BUTTON}>
          <span aria-hidden="true">✕</span>
          <span className="sr-only">Close (Escape)</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-5 pt-6 pb-3">
        <div className="flex shrink-0 flex-col items-center gap-2" title={mentor.expertise}>
          <Portrait
            name={mentor.name}
            portrait={portrait}
            image={mentor.image_url}
            className="size-16 sm:size-24"
          />
          <div className="flex w-16 flex-col items-center gap-1 sm:w-24" title={level.name}>
            <span className="text-center font-pixel text-[11px] leading-tight text-muted">
              Lv {level.level} · {level.name}
            </span>
            <span
              role="progressbar"
              aria-label={`Friendship with ${mentor.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level.progress * 100)}
              className="rpg-inset block h-2 w-full overflow-hidden"
            >
              <span
                className="block h-full bg-accent transition-[width]"
                style={{ width: `${Math.round(level.progress * 100)}%` }}
              />
            </span>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-28 min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {locked && (
            <p className="rpg-inset flex items-center gap-2 px-3 py-2 font-pixel text-sm text-muted">
              <Spinner label="Building memory" />
              {mentor.name} is still reading up on their own work. You can talk once they are done;
              this usually takes a minute or two.
            </p>
          )}
          {mentor.memory === 'failed' && (
            <p className="rpg-inset px-3 py-2 font-pixel text-sm text-muted">
              {mentor.name}&rsquo;s background reading failed, so answers draw on general knowledge
              only. It can be rebuilt from the classic view.
            </p>
          )}

          {showLog ? (
            <ScriptLog messages={state.messages} nameFor={() => mentor.name} />
          ) : (
            <>
              {question && <PlayerLine text={question.content} />}
              {reply?.failed ? (
                <p role="alert" className="flex items-start gap-2 font-pixel text-sm text-danger">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {reply.content}
                </p>
              ) : (
                <SpokenLine
                  shown={typewriter.shown}
                  thinking={thinking || (question !== null && reply === null)}
                  revealing={revealing || (streaming && !hasNextPage)}
                  finished={finished}
                  onSkip={typewriter.skip}
                  page={{ index: pageIndex, count: pages.length }}
                  onNextPage={pageDone ? turnPage : undefined}
                />
              )}
              {/* The visible line types out character by character; screen readers
                  get the whole reply once, when it has all arrived. */}
              <p className="sr-only" aria-live="polite">
                {reply && !streaming && !reply.failed && (finished || pageDone)
                  ? reply.content
                  : ''}
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
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 font-pixel text-base outline-none placeholder:text-faint disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={
              locked || state.isStreaming || !draft.trim() || draft.length > MAX_MESSAGE_CHARS
            }
            className="rpg-plate mb-1.5 h-7 shrink-0 bg-accent px-3 font-pixel text-sm text-on-accent hover:bg-accent-hover disabled:opacity-40"
          >
            Say
          </button>
        </div>
        <KeyHints id="dialogue-keys">
          Enter: say · Shift+Enter: new line
          {showLog ? '' : revealing ? ' · Space: skip' : pageDone ? ' · Space: next page' : ''} ·
          Esc: leave
        </KeyHints>
      </form>
    </section>
  )
}
