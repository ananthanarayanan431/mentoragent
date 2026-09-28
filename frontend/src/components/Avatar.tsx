import { useState } from 'react'

/** Up to two initials, e.g. "Marie Skłodowska Curie" -> "MC". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = words[0]![0]!
  const last = words.length > 1 ? words[words.length - 1]![0]! : ''
  return (first + last).toUpperCase()
}

interface Props {
  name: string
  src?: string | null
  /** Rendered size in pixels; also drives the font size of the fallback. */
  size?: number
  className?: string
}

/** A mentor's picture, falling back to initials when there is none or it 404s. */
export function Avatar({ name, src, size = 48, className = '' }: Props) {
  const [broken, setBroken] = useState(false)
  const style = { width: size, height: size }

  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full border border-line object-cover ${className}`}
        style={style}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.max(11, size * 0.36) }}
      className={`grid shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-accent ring-1 ring-line ${className}`}
    >
      {initials(name)}
    </span>
  )
}
