import { ArrowDown, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { MessageBubble } from './MessageBubble'
import type { Mentor, Message } from '../../types'

/** How far from the bottom still counts as "following along". */
const STICK_THRESHOLD_PX = 120

interface Props {
  messages: Message[]
  mentor: Mentor
  onSuggestion: (text: string) => void
}

export function MessageList({ messages, mentor, onSuggestion }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = containerRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(distance < STICK_THRESHOLD_PX)
  }, [])

  // Follow new tokens only while the user is already at the bottom, so reading
  // back through the conversation is not yanked away mid-stream.
  const lastContent = messages.at(-1)?.content
  useEffect(() => {
    if (atBottom) scrollToBottom('auto')
  }, [messages.length, lastContent, atBottom, scrollToBottom])

  if (!messages.length) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        <ConversationStarters mentor={mentor} onPick={onSuggestion} />
      </div>
    )
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-6 sm:px-6"
      >
        {/* Streaming text is announced politely rather than per token. */}
        <div className="mx-auto flex max-w-3xl flex-col gap-5" aria-live="polite">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              mentorName={mentor.name}
              mentorImage={mentor.image_url}
            />
          ))}
        </div>
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium shadow-lg transition-colors hover:bg-raised"
        >
          <ArrowDown size={13} aria-hidden="true" />
          Jump to latest
        </button>
      )}
    </div>
  )
}

function ConversationStarters({
  mentor,
  onPick,
}: {
  mentor: Mentor
  onPick: (text: string) => void
}) {
  const prompts = [
    `What first drew you to ${mentor.expertise.toLowerCase()}?`,
    'What mistake do beginners make most often?',
    'How would you spend the first month learning this?',
  ]

  return (
    <div className="w-full max-w-md text-center">
      <span className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
        <Sparkles size={20} aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">Ask {mentor.name} anything</h2>
      <p className="mt-2 text-sm text-muted">
        Answers are drawn from {mentor.name}&rsquo;s own published work.
      </p>
      <ul className="mt-6 space-y-2 text-left">
        {prompts.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm transition-colors hover:border-line-strong hover:bg-raised"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
