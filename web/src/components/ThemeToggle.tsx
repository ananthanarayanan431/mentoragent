import { Monitor, Moon, Sun } from 'lucide-react'

import type { Theme } from '../hooks/useTheme'

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

interface Props {
  theme: Theme
  onChange: (theme: Theme) => void
}

/** Three-way theme switch. A radio group, so arrow keys move between options. */
export function ThemeToggle({ theme, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(value)}
            className={`grid size-7 place-items-center rounded-full transition-colors ${
              active ? 'bg-accent-soft text-accent' : 'text-faint hover:bg-raised hover:text-ink'
            }`}
          >
            <Icon size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
