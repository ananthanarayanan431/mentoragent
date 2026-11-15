import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface SpokenLineProps {
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
export function SpokenLine({ shown, thinking, revealing, finished, onSkip }: SpokenLineProps) {
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
