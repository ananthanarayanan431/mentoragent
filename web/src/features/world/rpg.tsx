/**
 * Shared pieces of the in-world dialogue boxes, drawn like an RPG text box
 * rather than a chat app: a pixel portrait, buttons that sit on the frame, and a
 * log that reads like a script.
 */
import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Avatar } from '@/components/avatar'
import type { Message } from '@/lib/types'

/** Classes for a small button sitting on the box's frame (Log, New chat, ...). */
export const FRAME_BUTTON =
  'rpg-plate inline-flex h-7 items-center gap-1 bg-scroll px-2 font-pixel text-xs text-ink hover:bg-scroll-deep disabled:opacity-40 aria-pressed:bg-accent aria-pressed:text-on-accent'

interface PortraitProps {
  name: string
  /** The sprite portrait (data URL); falls back to their photo or initials. */
  portrait?: string | null | undefined
  image?: string | null | undefined
  /** Extra classes; set the size here (e.g. `size-16 sm:size-24`). */
  className?: string
}

/** A mentor's face in a sunken window, as an RPG shows who is speaking. */
export function Portrait({ name, portrait, image, className = '' }: PortraitProps) {
  return (
    <span
      aria-hidden="true"
      className={`rpg-inset grid shrink-0 place-items-center overflow-hidden ${className}`}
    >
      {portrait ? (
        <img src={portrait} alt="" className="pixelated size-full" />
      ) : (
        <Avatar name={name} src={image} size={48} />
      )}
    </span>
  )
}

/** The name plate on the box's top edge. */
export function NamePlate({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className="rpg-plate absolute -top-4 left-5 z-10 bg-accent px-3 py-0.5 font-pixel text-sm font-semibold tracking-wide text-on-accent uppercase"
    >
      {children}
    </span>
  )
}

/** The player's last words above the mentor's line. */
export function PlayerLine({ text }: { text: string }) {
  return (
    <p className="line-clamp-3 whitespace-pre-wrap break-words font-pixel text-sm text-muted">
      <span className="text-accent">You ▸ </span>
      <span>{text}</span>
    </p>
  )
}

interface ScriptLogProps {
  messages: readonly Message[]
  /** The speaker's name for a mentor line. */
  nameFor: (message: Message) => string
}

/** The whole conversation as a script: each line under its speaker's name. */
export function ScriptLog({ messages, nameFor }: ScriptLogProps) {
  return (
    <ol className="space-y-4" aria-label="Conversation log">
      {messages.map((message) => (
        <li key={message.id} className="animate-rise">
          <p
            className={`font-pixel text-xs tracking-wide uppercase ${
              message.role === 'user' ? 'text-muted' : 'text-accent'
            }`}
          >
            {message.role === 'user' ? 'You' : nameFor(message)} ▸
          </p>
          {message.role === 'user' ? (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted">
              {message.content}
            </p>
          ) : message.failed ? (
            <p role="alert" className="mt-0.5 flex items-start gap-2 text-sm text-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {message.content}
            </p>
          ) : (
            <div className="prose-reply mt-0.5 break-words text-[0.9375rem]">
              <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

/** Key hints along the bottom of the box, in the game's own type. */
export function KeyHints({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-2 hidden font-pixel text-xs text-faint sm:block">
      {children}
    </p>
  )
}
