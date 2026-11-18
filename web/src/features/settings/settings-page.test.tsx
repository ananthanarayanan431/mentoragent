import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { recordMessage } from '@/features/world/progress'
import { SquareProvider } from '@/features/squares/square-provider'
import type { LedgerLine, Mentor, Square } from '@/lib/types'
import { SettingsPage } from './settings-page'

const MENTORS: Mentor[] = [
  { id: 'ada', name: 'Ada', expertise: 'Engines', perspective: '', style: '', in_square: true },
  { id: 'bob', name: 'Bob', expertise: 'Bridges', perspective: '', style: '', in_square: true },
]

const api = vi.hoisted(() => ({
  listMentors: vi.fn<() => Promise<Mentor[]>>(),
  getGoal: vi.fn<() => Promise<{ goal: string | null }>>(),
  setGoal: vi.fn<(goal: string) => Promise<{ goal: string | null }>>(),
  listLedger: vi.fn<() => Promise<LedgerLine[]>>(),
  deleteLedgerLine: vi.fn<(id: string) => Promise<void>>(),
  listSquares: vi.fn<() => Promise<Square[]>>(),
  updateSquare: vi.fn<(id: string, changes: { name?: string }) => Promise<Square>>(),
  deleteSquare: vi.fn<(id: string) => Promise<void>>(),
}))

function square(id: string, name: string): Square {
  return { id, name, goal: null, mentor_ids: [], created_at: '2026-11-18T00:00:00Z' }
}
vi.mock('@/features/world/game/portraits', () => ({ portraitFor: () => null }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  ...api,
}))

function renderSettings() {
  render(
    <MemoryRouter>
      <SquareProvider>
        <SettingsPage />
      </SquareProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  api.listMentors.mockResolvedValue(MENTORS)
  api.getGoal.mockResolvedValue({ goal: null })
  api.setGoal.mockImplementation(async (goal) => ({ goal }))
  api.listLedger.mockResolvedValue([])
  api.deleteLedgerLine.mockResolvedValue()
  api.listSquares.mockResolvedValue([square('main', 'My square')])
  api.updateSquare.mockImplementation(async (id, { name }) => square(id, name ?? ''))
  api.deleteSquare.mockResolvedValue()
})

describe('SettingsPage', () => {
  it('sets the goal every mentor knows', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: 'Set your goal' }))
    await user.type(screen.getByRole('textbox', { name: 'Your goal' }), 'Retire by 45{Enter}')

    expect(api.setGoal).toHaveBeenCalledWith('Retire by 45')
    expect(await screen.findByText('Retire by 45')).toBeInTheDocument()
  })

  it('shows the saved goal', async () => {
    api.getGoal.mockResolvedValue({ goal: 'Retire by 45' })
    renderSettings()
    expect(await screen.findByText('Retire by 45')).toBeInTheDocument()
  })

  it('ticks off the mentors you have talked to', async () => {
    // Progress is kept per browser by the square; settings reads it back.
    recordMessage({}, 'bob')
    renderSettings()

    const met = await screen.findByRole('region', { name: /mentors met/i })
    expect(met).toHaveTextContent('1/2')
    expect(within(met).getByText('Bob').parentElement).toHaveTextContent('(met, level 1')
    expect(within(met).getByText('Ada').parentElement).toHaveTextContent('(not met yet)')
  })

  it('lists what the mentors told you, and forgets a line', async () => {
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
    const user = userEvent.setup()
    renderSettings()

    expect(await screen.findByText('Recommends studying the engine.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Forget this advice from Ada' }))

    expect(api.deleteLedgerLine).toHaveBeenCalledWith('l1')
    expect(screen.queryByText('Recommends studying the engine.')).not.toBeInTheDocument()
  })

  it('offers a retry when the mentors cannot be loaded', async () => {
    api.listMentors.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('region', { name: /mentors met/i })).toBeInTheDocument()
  })

  it('renames the square you are in', async () => {
    const user = userEvent.setup()
    renderSettings()

    const name = await screen.findByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Investing')
    await user.click(screen.getByRole('button', { name: 'Rename' }))

    expect(api.updateSquare).toHaveBeenCalledWith('main', { name: 'Investing' })
    expect(await screen.findByText('Renamed.')).toBeInTheDocument()
  })

  it('will not delete your only square', async () => {
    renderSettings()
    expect(await screen.findByText(/your only square/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete this square/ })).not.toBeInTheDocument()
  })

  it('deletes a square only after you confirm, then moves you to another', async () => {
    window.localStorage.setItem('mentoragent:square', 'cricket')
    api.listSquares.mockResolvedValue([square('main', 'My square'), square('cricket', 'Cricket')])
    const user = userEvent.setup()
    renderSettings()

    await user.click(await screen.findByRole('button', { name: /Delete this square/ }))
    expect(api.deleteSquare).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete square' }))

    expect(api.deleteSquare).toHaveBeenCalledWith('cricket')
    expect(window.localStorage.getItem('mentoragent:square')).toBe('main')
  })
})
