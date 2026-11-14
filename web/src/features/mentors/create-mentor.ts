/** Turns the "Create a mentor" form into a request body. Pure, so it is easy to test. */
import type { MentorCreate } from '@/lib/types'

export interface CreateMentorFields {
  name: string
  youtube: string
  websites: string
  pdfs: string
  notes: string
  wikipedia: boolean
  research: boolean
  expertise: string
  perspective: string
  style: string
}

export const EMPTY_FIELDS: CreateMentorFields = {
  name: '',
  youtube: '',
  websites: '',
  pdfs: '',
  notes: '',
  wikipedia: false,
  research: true,
  expertise: '',
  perspective: '',
  style: '',
}

/** Pasted posts are separated by a line holding only three or more dashes. */
const NOTE_SEPARATOR = /^\s*-{3,}\s*$/m

/** Sites that need a login, so the server cannot read them from a link. */
const LOGIN_WALLED = /^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//i

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * Turns the form into a request body, or says what to fix. Persona fields left
 * blank are left out, so the server writes them.
 */
export function buildMentorCreate(
  fields: CreateMentorFields,
): { body: MentorCreate } | { error: string } {
  const name = fields.name.trim()
  if (!name) return { error: 'Give the mentor a name.' }

  const links = {
    youtube_videos: lines(fields.youtube),
    websites: lines(fields.websites),
    pdfs: lines(fields.pdfs),
  }
  const all = [...links.youtube_videos, ...links.websites, ...links.pdfs]
  const walled = all.find((url) => LOGIN_WALLED.test(url))
  if (walled) {
    return {
      error: `LinkedIn pages need a login, so they can't be read from a link (${walled}). Paste the post text into "Posts and other text" instead.`,
    }
  }
  const insecure = all.find((url) => !/^https:\/\/\S+$/.test(url))
  if (insecure) return { error: `Links must start with https:// (${insecure}).` }
  for (const [label, list] of [
    ['YouTube videos', links.youtube_videos],
    ['Websites', links.websites],
    ['PDFs', links.pdfs],
  ] as const) {
    if (list.length > 20) return { error: `${label}: at most 20 links.` }
  }

  const notes = fields.notes
    .split(NOTE_SEPARATOR)
    .map((note) => note.trim())
    .filter(Boolean)
  if (notes.length > 20) return { error: 'Paste at most 20 posts.' }
  if (notes.some((note) => note.length > 20_000)) {
    return { error: 'Each pasted post can be at most 20,000 characters.' }
  }

  const body: MentorCreate = {
    name,
    ...links,
    notes,
    search_wikipedia: fields.wikipedia,
    research: fields.research,
  }
  for (const field of ['expertise', 'perspective', 'style'] as const) {
    const value = fields[field].trim()
    if (value) body[field] = value
  }
  return { body }
}
