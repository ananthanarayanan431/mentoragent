import { SendHorizontal } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

import { MAX_MESSAGE_CHARS } from '../../lib/config'

/** Beyond this many characters the remaining count is shown. */
const COUNTER_VISIBLE_FROM = MAX_MESSAGE_CHARS - 500
const MAX_TEXTAREA_HEIGHT_PX = 200

interface Props {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled: boolean
  mentorName: string
}

export function Composer({ value, onChange, onSubmit, disabled, mentorName }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow with the content up to a cap, then scroll inside the textarea.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`
  }, [value])

  const tooLong = value.length > MAX_MESSAGE_CHARS
  const canSend = value.trim().length > 0 && !tooLong && !disabled

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (canSend) onSubmit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter (and IME composition) insert a newline.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-t border-line bg-canvas/85 px-4 py-3 backdrop-blur-md sm:px-6"
    >
      <div
        className={`mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-surface p-2 transition-colors focus-within:border-accent ${
          tooLong ? 'border-danger' : 'border-line'
        }`}
      >
        <label htmlFor="composer" className="sr-only">
          Message {mentorName}
        </label>
        <textarea
          id="composer"
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Waiting for a reply…' : `Message ${mentorName}…`}
          aria-describedby="composer-hint"
          aria-invalid={tooLong}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] leading-relaxed outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendHorizontal size={16} aria-hidden="true" />
          <span className="sr-only">Send message</span>
        </button>
      </div>

      <div
        id="composer-hint"
        className="mx-auto mt-1.5 flex max-w-3xl justify-between px-2 text-xs text-faint"
      >
        <span>
          <kbd className="font-sans font-medium">Enter</kbd> to send,{' '}
          <kbd className="font-sans font-medium">Shift+Enter</kbd> for a new line
        </span>
        {value.length > COUNTER_VISIBLE_FROM && (
          <span className={tooLong ? 'font-medium text-danger' : ''}>
            {value.length.toLocaleString()} / {MAX_MESSAGE_CHARS.toLocaleString()}
          </span>
        )}
      </div>
    </form>
  )
}
