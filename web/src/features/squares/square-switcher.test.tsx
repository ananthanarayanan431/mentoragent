import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Square } from '@/lib/types'
import { SquareProvider } from './square-provider'
import { useSquares } from './use-squares'
import { SquareSwitcher } from './square-switcher'

const api = vi.hoisted(() => ({
  listSquares: vi.fn<() => Promise<Square[]>>(),
  createSquare: vi.fn<(body: { name: string }) => Promise<Square>>(),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  ...api,
}))

function square(id: string, name: string, mentors: string[] = []): Square {
  return { id, name, goal: null, mentor_ids: mentors, created_at: '2026-11-18T00:00:00Z' }
}

/** Stands in for the pages: shows which square they were mounted for. */
function Page() {
  const { currentId } = useSquares()
  return <p data-testid="page">{currentId}</p>
}

function renderSwitcher() {
  render(
    <SquareProvider>
      <SquareSwitcher />
      <Page />
    </SquareProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  api.listSquares.mockResolvedValue([
    square('main', 'My square', ['buffett', 'munger']),
    square('cricket', 'Cricket'),
  ])
  api.createSquare.mockImplementation(async ({ name }) => square('chess', name))
})

describe('SquareSwitcher', () => {
  it('shows the square you are in and lists the others with their mentor count', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    await user.click(await screen.findByRole('button', { name: 'Square: My square' }))

    const list = screen.getByRole('list', { name: 'Squares' })
    expect(list).toHaveTextContent('My square2')
    expect(list).toHaveTextContent('Cricket0')
    expect(screen.getByRole('button', { name: /My square/, current: true })).toBeInTheDocument()
  })

  it('switches square and remembers it', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    await user.click(await screen.findByRole('button', { name: 'Square: My square' }))
    await user.click(screen.getByRole('button', { name: /Cricket/ }))

    expect(screen.getByTestId('page')).toHaveTextContent('cricket')
    expect(screen.getByRole('button', { name: 'Square: Cricket' })).toBeInTheDocument()
    expect(window.localStorage.getItem('mentoragent:square')).toBe('cricket')
  })

  it('makes a new square and takes you into it', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    await user.click(await screen.findByRole('button', { name: 'Square: My square' }))
    await user.type(screen.getByLabelText('New square'), 'Chess')
    await user.click(screen.getByRole('button', { name: 'Make square' }))

    expect(api.createSquare).toHaveBeenCalledWith({ name: 'Chess' })
    expect(screen.getByTestId('page')).toHaveTextContent('chess')
    expect(screen.getByRole('button', { name: 'Square: Chess' })).toBeInTheDocument()
  })

  it('moves you to the first square if the one you were in is gone', async () => {
    window.localStorage.setItem('mentoragent:square', 'deleted')
    renderSwitcher()
    expect(await screen.findByRole('button', { name: 'Square: My square' })).toBeInTheDocument()
    expect(screen.getByTestId('page')).toHaveTextContent('main')
  })
})
