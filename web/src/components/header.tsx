import { Link, NavLink } from 'react-router'

import { ThemeToggle } from './theme-toggle'
import type { Theme } from '@/lib/use-theme'

interface Props {
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

export function Header({ theme, onThemeChange }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg font-semibold tracking-tight">
          <Logo />
          <span>
            Mentor<span className="text-accent">Agents</span>
          </span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <nav aria-label="Views" className="flex items-center gap-1 text-sm">
            <NavLink to="/" end className={navClass}>
              Square
            </NavLink>
            <NavLink to="/mentors" className={navClass}>
              Mentors
            </NavLink>
          </nav>
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </div>
      </div>
    </header>
  )
}

function navClass({ isActive }: { isActive: boolean }): string {
  return `rounded-md px-2.5 py-1.5 font-medium transition-colors ${
    // Active: the same colours as the primary buttons, which meet contrast in both themes.
    isActive ? 'bg-accent text-on-accent' : 'text-muted hover:bg-raised hover:text-ink'
  }`
}

function Logo() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      aria-hidden="true"
      className="text-accent"
    >
      {/* Two arcs facing each other: the mentor and the learner. */}
      <path
        d="M9 4.5a4.2 4.2 0 0 0 0 8.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M15 19.5a4.2 4.2 0 0 0 0-8.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="9" cy="16.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="15" cy="7.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
