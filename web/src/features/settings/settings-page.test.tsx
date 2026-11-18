import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { recordMessage } from '@/features/world/progress'
import type { LedgerLine, Mentor } from '@/lib/types'
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
}))
vi.mock('@/features/world/game/portraits', () => ({ portraitFor: () => null }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  ...api,
}))

function renderSettings() {
  render(
    <MemoryRouter>
      <SettingsPage />
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
})
