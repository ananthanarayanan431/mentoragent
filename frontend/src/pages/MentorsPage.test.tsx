import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MentorsPage } from './MentorsPage'

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

    expect(screen.getByRole('status')).toHaveTextContent('Loading mentors')
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
})
