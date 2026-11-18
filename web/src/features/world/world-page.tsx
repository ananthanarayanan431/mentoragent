import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ErrorState, Spinner } from '@/components/state-views'
import { ApiError, listMentors } from '@/lib/api'
import { MEMORY_POLL_MS } from '@/lib/config'
import type { Mentor } from '@/lib/types'
import { joinableMeeting, type Meeting } from './ambient'
import { bubbleTexts } from './bubbles'
import { DialogueBox } from './dialogue-box'
import { GroupDialogueBox } from './group-dialogue-box'
import { useMediaQuery } from '@/lib/use-media-query'
import { PauseMenu, TitleScreen } from './menus'
import { levelFor, loadFriendship, recordMessage } from './progress'
import { useAmbientChats } from './use-ambient-chats'
import { useLedger } from './use-ledger'
import { createWorldBridge } from './world-bridge'

type Mode =
  | { kind: 'title' }
  | { kind: 'playing' }
  | { kind: 'paused' }
  /** Talking with two mentors, joined while they were chatting. */
  | {
      kind: 'group'
      /** The one walked up to (answers first), then the other. */
      mentorIds: [string, string]
      ambientId: string | null
      lines: Meeting['lines']
    }
  | { kind: 'talking'; mentorId: string }

/**
 * Mentor Square: walk around a small town and talk to the mentors in person.
 * The game (Phaser, loaded lazily) owns the map and movement; React owns every
 * menu and the conversation, and the two talk only through the world bridge.
 */
export function WorldPage() {
  const [mentors, setMentors] = useState<Mentor[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    listMentors(controller.signal)
      .then(setMentors)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof ApiError ? cause.message : 'Could not load the mentors.')
      })
    return () => controller.abort()
  }, [attempt])

  if (error) {
    return (
      <main className="grid flex-1 place-items-center p-6">
        <ErrorState
          title="The square is closed"
          description={error}
          onRetry={() => {
            setError('')
            setAttempt((n) => n + 1)
          }}
        />
      </main>
    )
  }
  if (!mentors) {
    return (
      <main className="grid flex-1 place-items-center p-6">
        <Spinner label="Opening the square" />
      </main>
    )
  }
  return <World mentors={mentors} />
}

function World({ mentors: initialMentors }: { mentors: Mentor[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [bridge] = useState(createWorldBridge)
  const [mentors, setMentors] = useState(initialMentors)
  const [mode, setMode] = useState<Mode>({ kind: 'title' })
  const [labelsVisible, setLabelsVisible] = useState(true)
  const [friendship, setFriendship] = useState(loadFriendship)
  const [nearbyId, setNearbyId] = useState<string | null>(null)
  const [gameError, setGameError] = useState('')
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const ledger = useLedger()
  // The latest meeting between two mentors, read when the player asks to talk.
  const meetingRef = useRef<Meeting | null>(null)
  const { refreshSoon: refreshLedgerSoon } = ledger
  const labelsRef = useRef(labelsVisible)
  // The game is built once from the first roster; later arrivals go through `addMentor`.
  const firstRoster = useRef(initialMentors)
  const touch = useMediaQuery('(pointer: coarse)')
  const byId = useMemo(() => new Map(mentors.map((mentor) => [mentor.id, mentor])), [mentors])

  // --- The game: created once, destroyed on unmount --------------------------------

  useEffect(() => {
    const parent = containerRef.current
    if (!parent) return
    // One mutable object rather than reassigned locals: the async import and the
    // cleanup both touch it, and React's immutability lint forbids reassigning
    // a variable after render.
    const live: {
      cancelled: boolean
      game: { destroy: (removeCanvas: boolean) => void } | null
    } = { cancelled: false, game: null }

    import('./game/create-game')
      .then(({ createGame }) => {
        if (live.cancelled) return
        live.game = createGame(parent, {
          mentors: firstRoster.current.map(({ id, name }) => ({ id, name })),
          bridge,
          labelsVisible: labelsRef.current,
        })
      })
      .catch(() => setGameError('The game could not start in this browser.'))

    return () => {
      live.cancelled = true
      live.game?.destroy(true)
    }
  }, [bridge])

  // --- Mentors joining and memories building ------------------------------------

  // The latest roster and friendship, for callbacks that must not run side effects
  // inside a state updater (updaters must stay pure; React may run them twice).
  const mentorsRef = useRef(mentors)
  const friendshipRef = useRef(friendship)
  useEffect(() => {
    mentorsRef.current = mentors
    friendshipRef.current = friendship
  }, [mentors, friendship])

  /** Adds mentors the game has not seen, and refreshes the rest (memory status). */
  const mergeMentors = useCallback(
    (latest: Mentor[]) => {
      const current = mentorsRef.current
      const known = new Set(current.map((mentor) => mentor.id))
      const arrivals = latest.filter((mentor) => !known.has(mentor.id))
      const fresh = new Map(latest.map((mentor) => [mentor.id, mentor]))
      const next = [...current.map((mentor) => fresh.get(mentor.id) ?? mentor), ...arrivals]
      mentorsRef.current = next
      setMentors(next)
      for (const mentor of arrivals) {
        bridge.commands.emit('addMentor', { id: mentor.id, name: mentor.name })
      }
    },
    [bridge],
  )

  const building = mentors.some((mentor) => mentor.memory === 'building')
  useEffect(() => {
    if (!building) return
    const timer = window.setInterval(() => {
      listMentors()
        .then(mergeMentors)
        .catch(() => {}) // a missed poll is retried on the next tick
    }, MEMORY_POLL_MS)
    return () => window.clearInterval(timer)
  }, [building, mergeMentors])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  // --- Game -> React ---------------------------------------------------------------

  useEffect(() => {
    const offs = [
      bridge.events.on('ready', () => setReady(true)),
      bridge.events.on('failed', () => setGameError('The game could not draw the square.')),
      bridge.events.on('nearby', ({ mentorId }) => setNearbyId(mentorId)),
      bridge.events.on('talk', ({ mentorId }) => {
        // Walking up to two mentors who are chatting (or just were) joins them.
        const meeting = joinableMeeting(meetingRef.current, mentorId, Date.now())
        if (!meeting) {
          setMode({ kind: 'talking', mentorId })
          return
        }
        const other =
          meeting.mentorIds[0] === mentorId ? meeting.mentorIds[1] : meeting.mentorIds[0]
        bridge.commands.emit('joinTalk', { mentorId: other })
        setMode({
          kind: 'group',
          mentorIds: [mentorId, other],
          ambientId: meeting.ambientId,
          lines: meeting.lines,
        })
      }),
      bridge.events.on('pause', () => setMode({ kind: 'paused' })),
    ]
    return () => {
      for (const off of offs) off()
    }
  }, [bridge])

  // --- React -> game ---------------------------------------------------------------

  useEffect(() => {
    bridge.commands.emit('input', { enabled: mode.kind === 'playing' })
  }, [bridge, mode, ready])

  // The world stands still behind the title screen and the pause menu, but not during a
  // conversation: the other mentors keep strolling while the player talks.
  useEffect(() => {
    bridge.commands.emit('paused', { paused: mode.kind === 'title' || mode.kind === 'paused' })
  }, [bridge, mode, ready])

  // Now and then two mentors meet: about your goal if both advised you, otherwise a
  // short hello. Only while you walk around the square (never on the title, paused,
  // or in a dialogue).
  const meeting = useAmbientChats({
    bridge,
    active: ready && mode.kind === 'playing',
    mentors,
  })
  useEffect(() => {
    meetingRef.current = meeting
  }, [meeting])

  // What each mentor told you floats over them as the player walks past.
  useEffect(() => {
    bridge.commands.emit('bubbles', { texts: bubbleTexts(ledger.lines) })
  }, [bridge, ledger.lines, ready])

  useEffect(() => {
    labelsRef.current = labelsVisible
    bridge.commands.emit('labels', { visible: labelsVisible })
  }, [bridge, labelsVisible])

  const closeDialogue = useCallback(() => {
    if (mode.kind === 'talking') bridge.commands.emit('endTalk', { mentorId: mode.mentorId })
    if (mode.kind === 'group') {
      for (const mentorId of mode.mentorIds) bridge.commands.emit('endTalk', { mentorId })
    }
    setMode({ kind: 'playing' })
    containerRef.current?.focus()
    // The advice from this conversation is noted just after the reply.
    refreshLedgerSoon()
  }, [bridge, mode, refreshLedgerSoon])

  const messageSent = useCallback((mentor: Mentor) => {
    const { friendship: next, levelUp } = recordMessage(friendshipRef.current, mentor.id)
    friendshipRef.current = next
    setFriendship(next)
    if (levelUp) {
      setNotice(`Level ${levelUp.level}: you and ${mentor.name} are now ${levelUp.name}s.`)
    }
  }, [])

  const talkingTo = mode.kind === 'talking' ? byId.get(mode.mentorId) : undefined
  const group =
    mode.kind === 'group'
      ? mode.mentorIds.map((id) => byId.get(id)).filter((m): m is Mentor => m !== undefined)
      : []
  const nearby = nearbyId ? byId.get(nearbyId) : undefined

  return (
    <main className="relative flex-1 overflow-hidden bg-[#2f4a2c]">
      <div
        ref={containerRef}
        tabIndex={-1}
        data-world-root=""
        role="region"
        aria-label="Mentor Square. Use the arrow keys to walk."
        className="absolute inset-0 outline-none [&_canvas]:block"
      />

      {/* Announces who is in reach, for players who cannot see the prompt. */}
      <p className="sr-only" aria-live="polite">
        {mode.kind === 'playing' && nearby
          ? `${nearby.name} is next to you. Press Space to talk.`
          : ''}
      </p>

      {!ready && !gameError && (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner label="Drawing the square" />
        </div>
      )}
      {gameError && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <ErrorState title="Mentor Square could not start" description={gameError} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0">
        <p
          role="status"
          aria-live="polite"
          className={`absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-center font-mono text-xs text-canvas shadow-lg transition-opacity ${
            notice ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {notice}
        </p>

        {mode.kind === 'playing' && (
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-black/55 px-3 py-1.5 font-mono text-xs text-white">
            {touch
              ? 'Tap to walk · tap a mentor to talk'
              : 'Arrows/WASD walk · Space talk · Esc menu'}
          </p>
        )}

        {mode.kind === 'title' && ready && (
          <TitleScreen mentorCount={mentors.length} onStart={() => setMode({ kind: 'playing' })} />
        )}

        {mode.kind === 'paused' && (
          <PauseMenu
            labelsVisible={labelsVisible}
            onToggleLabels={() => setLabelsVisible((visible) => !visible)}
            onResume={() => setMode({ kind: 'playing' })}
          />
        )}

        {talkingTo && (
          <div className="absolute inset-x-0 bottom-0 z-20 p-3">
            <DialogueBox
              key={talkingTo.id}
              mentor={talkingTo}
              level={levelFor(friendship[talkingTo.id] ?? 0)}
              onClose={closeDialogue}
              onMessageSent={() => messageSent(talkingTo)}
            />
          </div>
        )}
        {mode.kind === 'group' && group.length === 2 && (
          <div className="absolute inset-x-0 bottom-0 z-20 p-3">
            <GroupDialogueBox
              key={mode.mentorIds.join('+')}
              mentors={[group[0]!, group[1]!]}
              ambientId={mode.ambientId}
              ambientLines={mode.lines}
              onClose={closeDialogue}
              onMessageSent={() => {
                for (const mentor of group) messageSent(mentor)
              }}
            />
          </div>
        )}
      </div>
    </main>
  )
}
