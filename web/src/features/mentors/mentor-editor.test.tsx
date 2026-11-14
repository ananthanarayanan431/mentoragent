import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api'
import type { Mentor, MentorSources, MentorUpdate } from '@/lib/types'
import { MentorEditor } from './mentor-editor'

const api = vi.hoisted(() => ({
  getMentorSources: vi.fn<(id: string) => Promise<MentorSources>>(),
  updateMentor: vi.fn<(id: string, changes: MentorUpdate) => Promise<Mentor>>(),
  rebuildMentorMemory: vi.fn<(id: string) => Promise<Mentor>>(),
  removeMentor: vi.fn<(id: string) => Promise<void>>(),
}))

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  ...api,
}))

const ADA: Mentor = {
  id: 'ada',
  name: 'Ada',
  expertise: 'Engines',
  perspective: 'Machines can compose.',
  style: 'Precise.',
}

function renderEditor(mentor: Mentor = ADA) {
  const onChange = vi.fn<(mentor: Mentor) => void>()
  const onRemoved = vi.fn<() => void>()
  render(<MentorEditor mentor={mentor} onChange={onChange} onRemoved={onRemoved} />)
  return { onChange, onRemoved }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getMentorSources.mockResolvedValue({
    websites: ['https://example.com/a'],
    pdfs: [],
    youtube_videos: [],
  })
  api.updateMentor.mockImplementation((_id, changes) =>
    Promise.resolve({ ...ADA, ...(changes as Partial<Mentor>) }),
  )
  api.rebuildMentorMemory.mockResolvedValue({ ...ADA, memory: 'building' })
  api.removeMentor.mockResolvedValue(undefined)
})

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Edit mentor' }))
  await waitFor(() =>
    expect(screen.getByLabelText(/^Websites/)).toHaveValue('https://example.com/a'),
  )
}

describe('MentorEditor', () => {
  it('saves only what changed, and rebuilds the memory when the sources changed', async () => {
    const user = userEvent.setup()
    const { onChange } = renderEditor()
    await open(user)

    await user.clear(screen.getByLabelText('Talking style'))
    await user.type(screen.getByLabelText('Talking style'), 'Brief and warm.')
    await user.type(screen.getByLabelText(/^PDFs/), 'https://example.com/b.pdf')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(api.updateMentor).toHaveBeenCalledWith('ada', {
      style: 'Brief and warm.',
      pdfs: ['https://example.com/b.pdf'],
    })
    expect(api.rebuildMentorMemory).toHaveBeenCalledWith('ada')
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ memory: 'building' }))
  })

  it('does not rebuild for a persona-only change, or when the box is unticked', async () => {
    const user = userEvent.setup()
    renderEditor()
    await open(user)

    await user.type(screen.getByLabelText('Expertise'), ' and poetry')
    await user.type(screen.getByLabelText(/^Websites/), '\nhttps://example.com/c')
    await user.click(screen.getByRole('checkbox', { name: /rebuild the memory/i }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(api.updateMentor).toHaveBeenCalled())
    expect(api.rebuildMentorMemory).not.toHaveBeenCalled()
  })

  it('shows the API error, e.g. an http URL rejected by the server', async () => {
    const user = userEvent.setup()
    api.updateMentor.mockRejectedValueOnce(new ApiError('String should match pattern', 422))
    renderEditor()
    await open(user)
    await user.type(screen.getByLabelText(/^PDFs/), 'http://insecure.example/a.pdf')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('String should match pattern')
  })

  it('rebuilds on request, but not while a build is running', async () => {
    const user = userEvent.setup()
    const { onChange } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'Rebuild memory' }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())

    renderEditor({ ...ADA, id: 'bob', memory: 'building' })
    expect(screen.getAllByRole('button', { name: 'Rebuild memory' }).at(-1)).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Building memory…')
  })

  it('removes a mentor only after confirming', async () => {
    const user = userEvent.setup()
    const { onRemoved } = renderEditor()

    await user.click(screen.getByRole('button', { name: 'Remove mentor' }))
    expect(api.removeMentor).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(screen.getByRole('button', { name: 'Remove mentor' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Remove mentor' }))
    await user.click(screen.getByRole('button', { name: 'Remove Ada' }))
    await waitFor(() => expect(onRemoved).toHaveBeenCalled())
    expect(api.removeMentor).toHaveBeenCalledWith('ada')
  })

  it('shows why a removal failed, and cannot remove while the memory builds', async () => {
    const user = userEvent.setup()
    api.removeMentor.mockRejectedValueOnce(new ApiError('Memory is being built', 409))
    const { onRemoved } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'Remove mentor' }))
    await user.click(screen.getByRole('button', { name: 'Remove Ada' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Memory is being built')
    expect(onRemoved).not.toHaveBeenCalled()

    renderEditor({ ...ADA, id: 'bob', memory: 'building' })
    expect(screen.getAllByRole('button', { name: 'Remove mentor' }).at(-1)).toBeDisabled()
  })

  it('has no remove button without onRemoved', () => {
    render(<MentorEditor mentor={ADA} onChange={vi.fn<(mentor: Mentor) => void>()} />)
    expect(screen.queryByRole('button', { name: 'Remove mentor' })).not.toBeInTheDocument()
  })
})
