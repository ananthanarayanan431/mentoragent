import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PresetPicker } from './preset-picker'

const PRESETS = [
  {
    id: 'isaac_newton',
    name: 'Isaac Newton',
    expertise: 'Gravity',
    perspective: 'Nature runs on exact laws.',
    style: 'Formal and exacting.',
    category: 'Science',
    added: false,
  },
  {
    id: 'albert_einstein',
    name: 'Albert Einstein',
    expertise: 'Relativity',
    perspective: 'p',
    style: 's',
    category: 'Science',
    added: true,
  },
  {
    id: 'viv_richards',
    name: 'Viv Richards',
    expertise: 'Batting',
    perspective: 'p',
    style: 's',
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
  in_square: false,
  memory: 'building',
}

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('PresetPicker', () => {
  it('groups presets by category and marks the ones already created', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<() => Promise<Response>>(() => json(PRESETS)),
    )
    render(<PresetPicker onCreated={() => {}} />)

    expect(await screen.findByRole('group', { name: 'Science' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Cricket' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Albert Einstein/ })).toBeDisabled()
    expect(screen.getByText('Already created')).toBeInTheDocument()
  })

  it('selecting a preset only shows who they are; nothing is created yet', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(() => json(PRESETS))
    vi.stubGlobal('fetch', fetchMock)
    const onCreated = vi.fn<(mentor: unknown) => void>()
    render(<PresetPicker onCreated={onCreated} />)

    await userEvent.click(await screen.findByRole('radio', { name: /Isaac Newton/ }))

    const about = screen.getByRole('group', { name: 'About Isaac Newton' })
    expect(about).toHaveTextContent('Nature runs on exact laws.')
    expect(about).toHaveTextContent('Formal and exacting.')
    expect(fetchMock).toHaveBeenCalledTimes(1) // only the list
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('creates the selected preset when asked', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>((url) =>
      url.endsWith('/mentors/presets') ? json(PRESETS) : json(NEWTON, 201),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onCreated = vi.fn<(mentor: unknown) => void>()
    render(<PresetPicker onCreated={onCreated} />)

    await userEvent.click(await screen.findByRole('radio', { name: /Isaac Newton/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Create Isaac Newton' }))

    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/mentors\/presets\/isaac_newton$/)
    expect(init.method).toBe('POST')
    expect(onCreated).toHaveBeenCalledWith(NEWTON)
    expect(screen.getByRole('radio', { name: /Isaac Newton/ })).toBeDisabled()
  })

  it('shows nothing when the agent offers no presets', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(() => json({ detail: 'Not Found' }, 404))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = render(<PresetPicker onCreated={() => {}} />)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
