import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'

import { Avatar } from './Avatar'
import type { Mentor } from '../types'

export function MentorCard({ mentor }: { mentor: Mentor }) {
  return (
    <Link
      to={`/chat/${encodeURIComponent(mentor.id)}`}
      className="group flex flex-col rounded-2xl border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg hover:shadow-black/5"
    >
      <div className="flex items-center gap-3">
        <Avatar name={mentor.name} src={mentor.image_url} size={48} />
        <div className="min-w-0">
          <h2 className="truncate font-semibold tracking-tight">{mentor.name}</h2>
          <p className="truncate text-sm text-muted">{mentor.expertise}</p>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">
        {mentor.perspective}
      </p>

      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
        Start a conversation
        <ArrowRight
          size={15}
          aria-hidden="true"
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  )
}
