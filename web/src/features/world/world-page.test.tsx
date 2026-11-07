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
    for (const name of ['input', 'labels', 'endTalk'] as const) {
      options.bridge.commands.on(name, (payload) => game.commands.push({ name, payload }))
    }
    return { destroy: () => (game.destroyed += 1) }
  },
}))

const api = vi.hoisted(() => ({ listMentors: vi.fn<() => Promise<Mentor[]>>() }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listMentors: api.listMentors,
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
    expect(within(log).getByText('Bob').parentElement).toHaveTextContent('(met)')
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

  it('places at most eight mentors, one per spawn spot', async () => {
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

    expect(game.started.at(-1)).toHaveLength(8)
    expect(screen.getByText(/8 mentors are strolling/)).toBeInTheDocument()
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
})
