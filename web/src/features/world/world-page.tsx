import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ErrorState, Spinner } from '@/components/state-views'
import { ApiError, listMentors } from '@/lib/api'
import type { Mentor } from '@/lib/types'
import { DialogueBox } from './dialogue-box'
import { useMediaQuery } from '@/lib/use-media-query'
import { PauseMenu, QuestLog, TitleScreen } from './menus'
import { loadMet, markMet } from './progress'
import { createWorldBridge } from './world-bridge'

/** Spawn spots in the map; more mentors than this stay in the classic view. */
const MAX_IN_WORLD = 8

type Mode =
  | { kind: 'title' }
  | { kind: 'playing' }
  | { kind: 'paused' }
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
      .then((all) => setMentors(all.slice(0, MAX_IN_WORLD)))
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

function World({ mentors }: { mentors: Mentor[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [bridge] = useState(createWorldBridge)
  const [mode, setMode] = useState<Mode>({ kind: 'title' })
  const [labelsVisible, setLabelsVisible] = useState(true)
  const [met, setMet] = useState(loadMet)
  const [nearbyId, setNearbyId] = useState<string | null>(null)
  const [gameError, setGameError] = useState('')
  const [ready, setReady] = useState(false)
  const labelsRef = useRef(labelsVisible)
  const touch = useMediaQuery('(pointer: coarse)')
  const byId = useMemo(() => new Map(mentors.map((mentor) => [mentor.id, mentor])), [mentors])

  // --- The game: created once per mentor roster, destroyed on unmount ----------

  useEffect(() => {
    const parent = containerRef.current
    if (!parent) return
    let game: { destroy: (removeCanvas: boolean) => void } | null = null
    let cancelled = false

    import('./game/create-game')
      .then(({ createGame }) => {
        if (cancelled) return
        game = createGame(parent, {
          mentors: mentors.map(({ id, name }) => ({ id, name })),
          bridge,
          labelsVisible: labelsRef.current,
        })
      })
      .catch(() => setGameError('The game could not start in this browser.'))

    return () => {
      cancelled = true
      game?.destroy(true)
    }
  }, [bridge, mentors])

  // --- Game -> React ---------------------------------------------------------------

  useEffect(() => {
    const offs = [
      bridge.events.on('ready', () => setReady(true)),
      bridge.events.on('nearby', ({ mentorId }) => setNearbyId(mentorId)),
      bridge.events.on('talk', ({ mentorId }) => setMode({ kind: 'talking', mentorId })),
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

  useEffect(() => {
    labelsRef.current = labelsVisible
    bridge.commands.emit('labels', { visible: labelsVisible })
  }, [bridge, labelsVisible])

  const closeDialogue = useCallback(() => {
    if (mode.kind === 'talking') bridge.commands.emit('endTalk', { mentorId: mode.mentorId })
    setMode({ kind: 'playing' })
    containerRef.current?.focus()
  }, [bridge, mode])

  const talkingTo = mode.kind === 'talking' ? byId.get(mode.mentorId) : undefined
  const nearby = nearbyId ? byId.get(nearbyId) : undefined

  return (
    <main className="relative flex-1 overflow-hidden bg-[#2f4a2c]">
      <div
        ref={containerRef}
        tabIndex={-1}
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
        {mode.kind !== 'title' && <QuestLog mentors={mentors} met={met} />}

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
              onClose={closeDialogue}
              onMessageSent={() => setMet((current) => markMet(current, talkingTo.id))}
            />
          </div>
        )}
      </div>
    </main>
  )
}
