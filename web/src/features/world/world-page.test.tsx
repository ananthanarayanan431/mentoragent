import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AmbientChat, ClientMessage, LedgerLine, Mentor, ServerEvent } from '@/lib/types'
import { AMBIENT_MAX_DELAY_MS } from './ambient'
import type { WorldBridge } from './world-bridge'
import { WorldPage } from './world-page'

const MENTORS: Mentor[] = [
  { id: 'ada', name: 'Ada', expertise: 'Engines', perspective: '', style: '', in_square: true },
  { id: 'bob', name: 'Bob', expertise: 'Bridges', perspective: '', style: '', in_square: true },
]

// The Phaser game is replaced by a stand-in that hands the test its bridge, so the
// test can play the game's part: report ready, a nearby mentor, a talk request.
const game = vi.hoisted(() => ({
  bridge: null as WorldBridge | null,
  destroyed: 0,
  fail: false,
  started: [] as { id: string; name: string }[][],
  commands: [] as { name: string; payload: unknown }[],
}))

vi.mock('./game/create-game', () => ({
  portraitFor: () => null,
  createGame: (
    _parent: HTMLElement,
    options: { bridge: WorldBridge; mentors: { id: string; name: string }[] },
  ) => {
    if (game.fail) throw new Error('WebGL unavailable')
    game.bridge = options.bridge
    game.started.push(options.mentors)
    for (const name of [
      'input',
      'labels',
      'endTalk',
      'paused',
      'addMentor',
      'removeMentor',
      'bubbles',
      'visit',
      'joinTalk',
    ] as const) {
      options.bridge.commands.on(name, (payload) => game.commands.push({ name, payload }))
    }
    return { destroy: () => (game.destroyed += 1) }
  },
}))

const api = vi.hoisted(() => ({
  listMentors: vi.fn<() => Promise<Mentor[]>>(),
  listLedger: vi.fn<() => Promise<LedgerLine[]>>(),
  deleteLedgerLine: vi.fn<(id: string) => Promise<void>>(),
  startAmbientChat: vi.fn<(ids: [string, string]) => Promise<AmbientChat>>(),
  setInSquare: vi.fn<(id: string, inSquare: boolean) => Promise<Mentor>>(),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listMentors: api.listMentors,
  listLedger: api.listLedger,
  deleteLedgerLine: api.deleteLedgerLine,
  startAmbientChat: api.startAmbientChat,
  setInSquare: api.setInSquare,
}))

// No real socket in tests. A request to speak first is answered with silence, as
// the server does when no other mentor has given advice yet.
vi.mock('@/features/chat/use-chat-socket', () => ({
  useChatSocket: ({ onEvent }: { onEvent: (event: ServerEvent) => void }) => ({
    status: 'open',
    reconnect: () => {},
    send: (request: ClientMessage) => {
      if ('opener' in request) {
        queueMicrotask(() => onEvent({ type: 'silent', conversation_id: null }))
      }
      return true
    },
  }),
}))

/** Plays the game's side: runs `run` with the bridge the page gave the game. */
function fromGame(run: (bridge: WorldBridge) => void) {
  act(() => run(game.bridge!))
}

/** A ledger line from this mentor (they have advised you). */
const said = (mentorId: string): LedgerLine => ({
  id: mentorId,
  mentor_id: mentorId,
  mentor_name: mentorId,
  topic: 't',
  advice: 'a',
  created_at: '2026-11-15T10:00:00Z',
})

async function renderWorld() {
  render(
    <MemoryRouter>
      <WorldPage />
    </MemoryRouter>,
  )
  await waitFor(() => expect(game.bridge).not.toBeNull())
  fromGame((bridge) => bridge.events.emit('ready', {}))
}

function lastPaused(): boolean | undefined {
  const paused = game.commands.filter((command) => command.name === 'paused')
  return (paused.at(-1)?.payload as { paused: boolean } | undefined)?.paused
}

function lastInput(): boolean | undefined {
  const inputs = game.commands.filter((command) => command.name === 'input')
  return (inputs.at(-1)?.payload as { enabled: boolean } | undefined)?.enabled
}

beforeEach(() => {
  window.localStorage.clear()
  game.bridge = null
  game.fail = false
  game.started = []
  game.commands = []
  api.listMentors.mockResolvedValue(MENTORS)
  api.listLedger.mockResolvedValue([])
  api.deleteLedgerLine.mockResolvedValue()
})

describe('WorldPage', () => {
  it('shows the title screen with the game frozen, then lets the player in', async () => {
    const user = userEvent.setup()
    await renderWorld()

    expect(screen.getByRole('heading', { name: 'Mentor Square' })).toBeInTheDocument()
    expect(screen.getByText(/2 mentors are strolling/)).toBeInTheDocument()
    expect(lastInput()).toBe(false)

    await user.click(screen.getByRole('button', { name: /enter the square/i }))

    expect(screen.queryByRole('heading', { name: 'Mentor Square' })).not.toBeInTheDocument()
    expect(lastInput()).toBe(true)
    // The square shows only the mentors and the conversation; the goal and progress live in settings.
    expect(screen.queryByRole('complementary', { name: 'Mentors met' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set your goal/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add a mentor/i })).not.toBeInTheDocument()
  })

  it('floats what each mentor told you over their head', async () => {
    api.listLedger.mockResolvedValue([
      {
        id: 'l1',
        mentor_id: 'ada',
        mentor_name: 'Ada',
        topic: 'engines',
        advice: 'Recommends studying the engine.',
        created_at: '2026-11-15T10:00:00Z',
      },
    ])
    await renderWorld()

    await waitFor(() =>
      expect(game.commands.findLast((command) => command.name === 'bubbles')?.payload).toEqual({
        texts: { ada: 'Told you about engines' },
      }),
    )
  })

  it('joins two mentors who are chatting when the player walks up to one', async () => {
    api.listLedger.mockResolvedValue(MENTORS.map((m) => said(m.id)))
    api.startAmbientChat.mockImplementation(async ([visitorId, hostId]) => ({
      id: 'amb1',
      mentor_ids: [visitorId, hostId],
      about_user: true,
      lines: [{ mentor_id: visitorId, text: 'About their goal...' }],
      created_at: '2026-11-15T10:00:00Z',
    }))
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await renderWorld()
      await user.click(screen.getByRole('button', { name: /enter the square/i }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AMBIENT_MAX_DELAY_MS)
      })
      const visit = game.commands.findLast((command) => command.name === 'visit')?.payload as
        { visitorId: string; hostId: string } | undefined
      expect(visit).toBeDefined()

      fromGame((bridge) => bridge.events.emit('met', visit!))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      fromGame((bridge) => bridge.events.emit('talk', { mentorId: visit!.hostId }))

      expect(
        await screen.findByRole('dialog', { name: /^Conversation with .+ and .+$/ }),
      ).toHaveTextContent('About their goal...')
      expect(game.commands).toContainEqual({
        name: 'joinTalk',
        payload: { mentorId: visit!.visitorId },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens a conversation when the game asks to talk, and closes it with Escape', async () => {
    const user = userEvent.setup()
    await renderWorld()
    await user.click(screen.getByRole('button', { name: /enter the square/i }))

    fromGame((bridge) => bridge.events.emit('nearby', { mentorId: 'ada' }))
    expect(screen.getByText('Ada is next to you. Press Space to talk.')).toBeInTheDocument()

    fromGame((bridge) => bridge.events.emit('talk', { mentorId: 'ada' }))
    const dialog = screen.getByRole('dialog', { name: 'Conversation with Ada' })
    expect(dialog).toBeInTheDocument()
    expect(lastInput()).toBe(false)
    expect(screen.getByRole('textbox', { name: 'Message Ada' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Conversation with Ada' })).not.toBeInTheDocument()
    expect(game.commands).toContainEqual({ name: 'endTalk', payload: { mentorId: 'ada' } })
    expect(lastInput()).toBe(true)
  })

  it('pauses on request, toggles name labels, and resumes', async () => {
    const user = userEvent.setup()
    await renderWorld()
    await user.click(screen.getByRole('button', { name: /enter the square/i }))

    fromGame((bridge) => bridge.events.emit('pause', {}))
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeInTheDocument()
    expect(lastInput()).toBe(false)

    await user.click(screen.getByRole('button', { name: /hide name labels/i }))
    expect(game.commands).toContainEqual({ name: 'labels', payload: { visible: false } })

    await user.click(screen.getByRole('button', { name: /resume/i }))
    expect(screen.queryByRole('dialog', { name: 'Paused' })).not.toBeInTheDocument()
    expect(lastInput()).toBe(true)
  })

  it('starts with only the mentors in the square, and brings others in or sends them out', async () => {
    const CARL: Mentor = { ...MENTORS[1]!, id: 'carl', name: 'Carl', in_square: false }
    api.listMentors.mockResolvedValue([...MENTORS, CARL])
    api.setInSquare.mockImplementation((id, inSquare) => {
      const mentor = [...MENTORS, CARL].find((m) => m.id === id)!
      return Promise.resolve({ ...mentor, in_square: inSquare })
    })
    const user = userEvent.setup()
    await renderWorld()
    expect(game.started.at(-1)?.map((m) => m.id)).toEqual(['ada', 'bob'])

    await user.click(screen.getByRole('button', { name: /enter the square/i }))
    fromGame((bridge) => bridge.events.emit('pause', {}))
    await user.click(screen.getByRole('button', { name: /mentors in the square/i }))
    expect(lastPaused()).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Bring in: Carl' }))
    expect(api.setInSquare).toHaveBeenCalledWith('carl', true)
    expect(game.commands).toContainEqual({
      name: 'addMentor',
      payload: { id: 'carl', name: 'Carl' },
    })

    await user.click(screen.getByRole('button', { name: 'Send out: Ada' }))
    expect(api.setInSquare).toHaveBeenCalledWith('ada', false)
    expect(game.commands).toContainEqual({ name: 'removeMentor', payload: { id: 'ada' } })
    expect(screen.getByRole('button', { name: 'Bring in: Ada' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeInTheDocument()
  })

  it('offers a retry when the mentors cannot be loaded', async () => {
    api.listMentors.mockRejectedValueOnce(new Error('offline'))
    render(
      <MemoryRouter>
        <WorldPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('The square is closed')).toBeInTheDocument()
  })

  it('says so when the game cannot start, instead of hanging on the spinner', async () => {
    game.fail = true
    render(
      <MemoryRouter>
        <WorldPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Mentor Square could not start')).toBeInTheDocument()
    expect(screen.queryByText('Drawing the square')).not.toBeInTheDocument()
  })

  it('places every mentor, however many there are', async () => {
    api.listMentors.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        id: `m${i}`,
        name: `Mentor ${i}`,
        expertise: '',
        perspective: '',
        style: '',
        in_square: true,
      })),
    )
    await renderWorld()

    expect(game.started.at(-1)).toHaveLength(11)
    expect(screen.getByText(/11 mentors are strolling/)).toBeInTheDocument()
  })

  it('announces a friendship level-up', async () => {
    const user = userEvent.setup()
    await renderWorld()
    await user.click(screen.getByRole('button', { name: /enter the square/i }))
    fromGame((bridge) => bridge.events.emit('talk', { mentorId: 'ada' }))

    await user.type(screen.getByRole('textbox', { name: 'Message Ada' }), 'Hi{Enter}')

    expect(screen.getByText('Level 1: you and Ada are now Acquaintances.')).toBeInTheDocument()
    expect(screen.getByText(/Lv 1 · Acquaintance/)).toBeInTheDocument()
  })

  it('loads the mentors again when the player retries', async () => {
    const user = userEvent.setup()
    api.listMentors.mockRejectedValueOnce(new Error('offline'))
    render(
      <MemoryRouter>
        <WorldPage />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /try again/i }))

    await waitFor(() => expect(game.bridge).not.toBeNull())
    expect(api.listMentors).toHaveBeenCalledTimes(2)
  })

  it('destroys the game when the page goes away', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <WorldPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(game.bridge).not.toBeNull())
    const before = game.destroyed
    unmount()
    expect(game.destroyed).toBe(before + 1)
  })

  it('freezes the world on the title screen and when paused, not while talking', async () => {
    const user = userEvent.setup()
    await renderWorld()
    expect(lastPaused()).toBe(true)

    await user.click(screen.getByRole('button', { name: /enter the square/i }))
    expect(lastPaused()).toBe(false)

    fromGame((bridge) => bridge.events.emit('talk', { mentorId: 'ada' }))
    expect(lastPaused()).toBe(false)
    await user.keyboard('{Escape}')

    fromGame((bridge) => bridge.events.emit('pause', {}))
    expect(lastPaused()).toBe(true)
    await user.click(screen.getByRole('button', { name: /resume/i }))
    expect(lastPaused()).toBe(false)
  })

  it('closes the pause menu with Escape and keeps Tab inside it', async () => {
    const user = userEvent.setup()
    await renderWorld()
    await user.click(screen.getByRole('button', { name: /enter the square/i }))
    fromGame((bridge) => bridge.events.emit('pause', {}))

    const pause = screen.getByRole('dialog', { name: 'Paused' })
    for (let i = 0; i < 5; i++) {
      // Key presses are sequential by nature; they cannot run in parallel.
      // oxlint-disable-next-line no-await-in-loop
      await user.tab()
      expect(pause).toContainElement(document.activeElement as HTMLElement)
    }

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Paused' })).not.toBeInTheDocument()
    expect(lastPaused()).toBe(false)
  })

  it('shows an error when the scene cannot build the world', async () => {
    await renderWorld()
    fromGame((bridge) => bridge.events.emit('failed', { message: 'no textures' }))
    expect(screen.getByText('Mentor Square could not start')).toBeInTheDocument()
  })

  it('refreshes a building memory until it is ready, then stops polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const building = { ...MENTORS[0]!, memory: 'building' as const }
      api.listMentors.mockResolvedValueOnce([building, MENTORS[1]!])
      await renderWorld()
      fromGame((bridge) => bridge.events.emit('talk', { mentorId: 'ada' }))
      expect(screen.getByText(/still reading up on their own work/)).toBeInTheDocument()

      api.listMentors.mockResolvedValue([{ ...building, memory: 'ready' }, MENTORS[1]!])
      await act(() => vi.advanceTimersByTimeAsync(5000))

      expect(screen.queryByText(/still reading up on their own work/)).not.toBeInTheDocument()
      const calls = api.listMentors.mock.calls.length
      await act(() => vi.advanceTimersByTimeAsync(15000))
      expect(api.listMentors.mock.calls.length).toBe(calls) // nothing building: no more polls
    } finally {
      vi.useRealTimers()
    }
  })
})
