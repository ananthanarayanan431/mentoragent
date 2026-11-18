import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PresetPicker } from './preset-picker'

const PRESETS = [
  {
    id: 'isaac_newton',
    name: 'Isaac Newton',
    expertise: 'Gravity',
    category: 'Science',
    added: false,
  },
  {
    id: 'albert_einstein',
    name: 'Albert Einstein',
    expertise: 'Relativity',
    category: 'Science',
    added: true,
  },
  {
    id: 'viv_richards',
    name: 'Viv Richards',
    expertise: 'Batting',
    category: 'Cricket',
    added: false,
  },
]

const NEWTON = {
  id: 'isaac_newton',
  name: 'Isaac Newton',
  expertise: 'Gravity',
  perspective: 'p',
  style: 's',
  image_url: null,
  memory: 'building',
}

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('PresetPicker', () => {
  it('groups presets by category and marks the ones already here', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json(PRESETS)),
    )
    render(<PresetPicker onAdded={() => {}} />)

    expect(await screen.findByRole('region', { name: 'Science presets' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Cricket presets' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Albert Einstein is in the square' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Isaac Newton' })).toBeEnabled()
  })

  it('adds a preset with one click', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>((url) =>
      url.endsWith('/mentors/presets') ? json(PRESETS) : json(NEWTON, 201),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onAdded = vi.fn<(mentor: unknown) => void>()
    render(<PresetPicker onAdded={onAdded} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Add Isaac Newton' }))

    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/mentors\/presets\/isaac_newton$/)
    expect(init.method).toBe('POST')
    expect(onAdded).toHaveBeenCalledWith(NEWTON)
    expect(screen.getByRole('button', { name: 'Isaac Newton is in the square' })).toBeDisabled()
  })

  it('shows nothing when the agent offers no presets', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(() => json({ detail: 'Not Found' }, 404))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(<PresetPicker onAdded={() => {}} />)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
