import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MentorsPage } from './mentors-page'

const mentor = {
  id: 'ada',
  name: 'Ada Lovelace',
  expertise: 'Computing',
  perspective: 'Machines can do more than arithmetic.',
  style: 'Precise and curious',
  image_url: null,
}

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  )
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MentorsPage />
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('MentorsPage', () => {
  it('shows a loading status before the mentors arrive', () => {
    mockFetch([mentor])
    renderPage()

    expect(screen.getByText('Loading mentors')).toHaveAttribute('role', 'status')
  })

  it('lists each mentor as a link to its chat', async () => {
    mockFetch([mentor])
    renderPage()

    const link = await screen.findByRole('link', { name: /Ada Lovelace/ })
    expect(link).toHaveAttribute('href', '/chat/ada')
    expect(screen.getByText('Computing')).toBeInTheDocument()
  })

  it('explains an empty database instead of showing a blank page', async () => {
    mockFetch([])
    renderPage()

    expect(await screen.findByText('No mentors yet')).toBeInTheDocument()
  })

  it('offers a retry when the backend cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(/Is the backend running/)
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
  })

  it('adds a random mentor to the list', async () => {
    const graham = { ...mentor, id: 'graham', name: 'Benjamin Graham', memory: 'building' }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const body = url.endsWith('/mentors/pool')
          ? { remaining: 4, total: 12 }
          : url.endsWith('/mentors/random') && init?.method === 'POST'
            ? graham
            : [mentor]
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Add a random mentor' }))

    expect(await screen.findByText('Benjamin Graham')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Benjamin Graham joined')
  })

  it('creates a mentor from the form and lists them', async () => {
    const grace = { ...mentor, id: 'grace_hopper', name: 'Grace Hopper', memory: 'building' }
    vi.stubGlobal(
      'fetch',
      vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url, init) => {
        if (init?.method === 'POST') {
          return Promise.resolve(new Response(JSON.stringify(grace), { status: 201 }))
        }
        const body = url.endsWith('/mentors/pool') ? { remaining: 0, total: 1 } : [mentor]
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Create a mentor' }))
    await user.type(screen.getByLabelText('Name'), 'Grace Hopper')
    await user.click(screen.getByRole('button', { name: 'Create mentor' }))

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create mentor' })).not.toBeInTheDocument()
    expect(screen.getByText(/Grace Hopper was created/)).toBeInTheDocument()
  })

  it('removes a mentor from the card menu, after confirming', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url, init) => {
      if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
      const body = url.endsWith('/mentors/pool') ? { remaining: 0, total: 1 } : [mentor]
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'More options for Ada Lovelace' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove mentor' }))
    expect(screen.getByRole('alertdialog', { name: 'Remove Ada Lovelace?' })).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'DELETE' }),
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('No mentors yet')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/mentors/ada',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('keeps the mentor and shows why when the removal fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          const detail = { detail: "This mentor's memory is being built" }
          return Promise.resolve(new Response(JSON.stringify(detail), { status: 409 }))
        }
        const body = url.endsWith('/mentors/pool') ? { remaining: 0, total: 1 } : [mentor]
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
      }),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'More options for Ada Lovelace' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove mentor' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('memory is being built')
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toBeInTheDocument()
  })

  it('closes the card menu on Escape', async () => {
    mockFetch([mentor])
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'More options for Ada Lovelace' }))
    expect(screen.getByRole('menu')).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
