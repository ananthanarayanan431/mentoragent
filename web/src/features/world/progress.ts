/**
 * Friendship with each mentor: it grows with every message the player sends them,
 * and levels up at a few thresholds. Stored per browser; every storage access is
 * wrapped, so without storage progress lasts for the visit.
 */

const KEY = 'mentoragent:world:friendship'
/** The first version only stored which mentors were met; read it once to migrate. */
const LEGACY_MET_KEY = 'mentoragent:world:met'

/** Messages needed for each level; level 0 is "not met yet". */
export const LEVEL_THRESHOLDS = [1, 3, 6, 10, 16] as const
export const LEVEL_NAMES = [
  'Stranger',
  'Acquaintance',
  'Regular',
  'Confidant',
  'Friend',
  'Protégé',
] as const
export const MAX_LEVEL = LEVEL_THRESHOLDS.length

/** Messages sent to each mentor, by mentor id. */
export type Friendship = Readonly<Record<string, number>>

export interface Level {
  level: number
  name: string
  /** Messages still needed for the next level; 0 at the top. */
  toNext: number
  /** Progress from this level to the next, 0 to 1 (1 at the top). */
  progress: number
}

export function levelFor(messages: number): Level {
  const level = LEVEL_THRESHOLDS.filter((threshold) => messages >= threshold).length
  if (level === MAX_LEVEL) return { level, name: LEVEL_NAMES[level]!, toNext: 0, progress: 1 }
  const from = level === 0 ? 0 : LEVEL_THRESHOLDS[level - 1]!
  const to = LEVEL_THRESHOLDS[level]!
  return {
    level,
    name: LEVEL_NAMES[level]!,
    toNext: to - messages,
    progress: (messages - from) / (to - from),
  }
}

export function hasMet(friendship: Friendship, mentorId: string): boolean {
  return (friendship[mentorId] ?? 0) > 0
}

function isCounts(value: unknown): value is Record<string, number> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as object).every((n) => Number.isInteger(n) && (n as number) >= 0)
  )
}

export function loadFriendship(): Friendship {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      return isCounts(parsed) ? parsed : {}
    }
    // Migrate: a mentor already met starts at level 1.
    const legacy: unknown = JSON.parse(window.localStorage.getItem(LEGACY_MET_KEY) ?? '[]')
    if (!Array.isArray(legacy)) return {}
    return Object.fromEntries(
      legacy.filter((id): id is string => typeof id === 'string').map((id) => [id, 1]),
    )
  } catch {
    return {}
  }
}

function save(friendship: Friendship): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(friendship))
  } catch {
    // Storage blocked or full: keep the progress in memory only.
  }
}

export interface MessageRecorded {
  friendship: Friendship
  /** The new level when this message levelled the friendship up, else null. */
  levelUp: Level | null
}

/** Counts one more message to `mentorId`; returns the new state (a new object). */
export function recordMessage(friendship: Friendship, mentorId: string): MessageRecorded {
  const before = friendship[mentorId] ?? 0
  const next = { ...friendship, [mentorId]: before + 1 }
  save(next)
  const after = levelFor(before + 1)
  return { friendship: next, levelUp: after.level > levelFor(before).level ? after : null }
}

export function resetFriendship(): Friendship {
  try {
    window.localStorage.removeItem(KEY)
    window.localStorage.removeItem(LEGACY_MET_KEY)
  } catch {
    // Nothing stored that we could clear.
  }
  return {}
}
