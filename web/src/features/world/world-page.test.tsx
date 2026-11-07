import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Mentor } from '@/lib/types'
import type { WorldBridge } from './world-bridge'
import { WorldPage } from './world-page'

const MENTORS: Mentor[] = [
  { id: 'ada', name: 'Ada', expertise: 'Engines', perspective: '', style: '' },
  { id: 'bob', name: 'Bob', expertise: 'Bridges', perspective: '', style: '' },
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
  createGame: (
    _parent: HTMLElement,
    options: { bridge: WorldBridge; mentors: { id: string; name: string }[] },
  ) => {
    if (game.fail) throw new Error('WebGL unavailable')
    game.bridge = options.bridge
    game.started.push(options.mentors)
    for (const name of ['input', 'labels', 'endTalk', 'paused', 'addMentor'] as const) {
      options.bridge.commands.on(name, (payload) => game.commands.push({ name, payload }))
    }
    return { destroy: () => (game.destroyed += 1) }
  },
}))

const api = vi.hoisted(() => ({
  listMentors: vi.fn<() => Promise<Mentor[]>>(),
  getMentorPool: vi.fn<() => Promise<{ remaining: number; total: number }>>(),
  addRandomMentor: vi.fn<() => Promise<Mentor>>(),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listMentors: api.listMentors,
  getMentorPool: api.getMentorPool,
  addRandomMentor: api.addRandomMentor,
}))

// No real socket in tests; the dialogue only needs the hook to render.
vi.mock('@/features/chat/use-chat-socket', () => ({
  useChatSocket: () => ({ status: 'open', reconnect: () => {}, send: () => true }),
}))

/** Plays the game's side: runs `run` with the bridge the page gave the game. */
function fromGame(run: (bridge: WorldBridge) => void) {
  act(() => run(game.bridge!))
}

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
  api.getMentorPool.mockResolvedValue({ remaining: 5, total: 12 })
  game.started = []
  game.commands = []
  api.listMentors.mockResolvedValue(MENTORS)
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
    expect(screen.getByRole('complementary', { name: 'Mentors met' })).toHaveTextContent('0/2')
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

  it('ticks a mentor off the quest log once the player has said something', async () => {
    const user = userEvent.setup()
    await renderWorld()
    await user.click(screen.getByRole('button', { name: /enter the square/i }))
    fromGame((bridge) => bridge.events.emit('talk', { mentorId: 'bob' }))

    await user.type(screen.getByRole('textbox', { name: 'Message Bob' }), 'Hello{Enter}')

    const log = screen.getByRole('complementary', { name: 'Mentors met' })
    expect(log).toHaveTextContent('1/2')
    // Collapsed by default where matchMedia is unavailable (as on narrow screens).
    await user.click(screen.getByRole('button', { name: /mentors met/i }))
    expect(within(log).getByText('Bob').parentElement).toHaveTextContent('(met, level 1')
    expect(within(log).getByText('Ada').parentElement).toHaveTextContent('(not met yet)')
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
      })),
    )
    await renderWorld()

    expect(game.started.at(-1)).toHaveLength(11)
    expect(screen.getByText(/11 mentors are strolling/)).toBeInTheDocument()
  })

  it('adds a random mentor: the game gets them and the arrival is announced', async () => {
    const user = userEvent.setup()
    const graham: Mentor = {
      id: 'graham',
      name: 'Benjamin Graham',
      expertise: 'Value',
      perspective: '',
      style: '',
      memory: 'building',
    }
    api.addRandomMentor.mockResolvedValueOnce(graham)
    await renderWorld()
    await user.click(screen.getByRole('button', { name: /enter the square/i }))

    await user.click(await screen.findByRole('button', { name: /add a mentor/i }))

    expect(
      await screen.findByText('Benjamin Graham has arrived in the square!'),
    ).toBeInTheDocument()
    expect(game.commands).toContainEqual({
      name: 'addMentor',
      payload: { id: 'graham', name: 'Benjamin Graham' },
    })
    expect(screen.getByRole('complementary', { name: 'Mentors met' })).toHaveTextContent('0/3')
    // The new mentor can be talked to straight away, with a note that they are still reading up.
    fromGame((bridge) => bridge.events.emit('talk', { mentorId: 'graham' }))
    expect(screen.getByText(/still reading up on their own work/)).toBeInTheDocument()
  })

  it('disables "Add a mentor" once everyone in the pool is here', async () => {
    const user = userEvent.setup()
    api.getMentorPool.mockResolvedValue({ remaining: 0, total: 12 })
    await renderWorld()
    await user.click(screen.getByRole('button', { name: /enter the square/i }))
    expect(await screen.findByRole('button', { name: /everyone is here/i })).toBeDisabled()
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
