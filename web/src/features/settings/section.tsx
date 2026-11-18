import type { ReactNode } from 'react'

/** Draws a mentor's sprite portrait; null until the drawing code has loaded. */
export type PortraitFor = ((id: string) => string | null) | null

/** A section title in the square's pixel type, with something on the right. */
export function SectionHeading({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-3 border-b-2 border-line pb-2">
      <h2 id={id} className="font-pixel text-lg font-semibold tracking-wide text-ink">
        {title}
      </h2>
      {children}
    </div>
  )
}
