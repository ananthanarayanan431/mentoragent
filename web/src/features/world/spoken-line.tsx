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
  /** Which page of a long line this is, when there is more than one. */
  page?: { index: number; count: number } | undefined
  /** Turns to the next page; the marker shows while this page is done. */
  onNextPage?: (() => void) | undefined
}

/**
 * The mentor's current line, typing itself out in the game's pixel type. A click
 * shows the rest at once, or turns the page when this one is done.
 */
export function SpokenLine({
  shown,
  thinking,
  revealing,
  finished,
  onSkip,
  page,
  onNextPage,
}: SpokenLineProps) {
  if (thinking) {
    return (
      <p className="flex items-center gap-1.5 py-2" aria-label="Thinking">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2 animate-blink bg-faint"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </p>
    )
  }

  const onClick = revealing ? onSkip : onNextPage
  return (
    <div
      aria-hidden="true"
      onClick={onClick}
      className={`relative pb-5 ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="prose-reply break-words font-pixel text-[1.0625rem] leading-relaxed">
        <Markdown remarkPlugins={[remarkGfm]}>{shown}</Markdown>
      </div>
      {revealing && (
        <span className="ml-0.5 inline-block h-[1em] w-2 translate-y-[0.15em] animate-blink bg-accent" />
      )}
      <span className="absolute right-0 bottom-0 flex items-center gap-2 font-pixel text-xs text-accent">
        {page && page.count > 1 && (
          <span className="text-faint">
            {page.index + 1}/{page.count}
          </span>
        )}
        {(finished || (onNextPage && !revealing)) && <span className="animate-blink">▼</span>}
      </span>
    </div>
  )
}
