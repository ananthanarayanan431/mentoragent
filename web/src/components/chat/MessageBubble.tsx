import { AlertCircle } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Avatar } from '../Avatar'
import type { Message } from '../../types'

interface Props {
  message: Message
  mentorName: string
  mentorImage: string | null
}

export function MessageBubble({ message, mentorName, mentorImage }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-rise">
        <div className="max-w-[85ch] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-on-accent">
          <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  if (message.failed) {
    return (
      <div role="alert" className="flex gap-3 animate-rise">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
          <AlertCircle size={16} aria-hidden="true" />
        </span>
        <p className="self-center text-sm text-danger">{message.content}</p>
      </div>
    )
  }

  return (
    <div className="flex gap-3 animate-rise">
      <Avatar name={mentorName} src={mentorImage} size={32} className="mt-0.5" />
      <div className="min-w-0 flex-1 pt-1">
        <div className="prose-reply max-w-[85ch] break-words text-[0.9375rem]">
          <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          {message.streaming && <StreamingCaret empty={message.content.length === 0} />}
        </div>
      </div>
    </div>
  )
}

/** Shows the reply is still arriving: three dots at first, then a caret. */
function StreamingCaret({ empty }: { empty: boolean }) {
  if (empty) {
    return (
      <span className="flex items-center gap-1 py-1" aria-label="Thinking">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-blink rounded-full bg-faint"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-blink bg-accent"
    />
  )
}
