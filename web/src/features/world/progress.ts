/**
 * Which mentors the player has talked to in the world: the quest log's progress.
 * Every storage access is wrapped; without storage, progress lasts for the visit.
 */

const KEY = 'mentoragent:world:met'

export function loadMet(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Records `mentorId` as met and returns the updated set (a new object). */
export function markMet(met: ReadonlySet<string>, mentorId: string): Set<string> {
  const next = new Set(met)
  next.add(mentorId)
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {
    // Storage blocked or full: keep the progress in memory only.
  }
  return next
}

export function resetMet(): Set<string> {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing stored that we could clear.
  }
  return new Set()
}
