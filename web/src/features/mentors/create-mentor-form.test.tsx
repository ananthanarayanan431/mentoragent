import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildMentorCreate, EMPTY_FIELDS } from './create-mentor'
import { CreateMentorForm } from './create-mentor-form'

afterEach(() => vi.unstubAllGlobals())

describe('buildMentorCreate', () => {
  it('splits links by line and pasted posts by ---, and leaves blank persona out', () => {
    const result = buildMentorCreate({
      ...EMPTY_FIELDS,
      name: '  Grace Hopper ',
      youtube: 'https://youtu.be/a\n\n  https://youtu.be/b ',
      websites: 'https://example.com/about',
      notes: 'First post\n---\nSecond post\n\n-----\n',
      style: '  Blunt ',
    })

    expect(result).toEqual({
      body: {
        name: 'Grace Hopper',
        youtube_videos: ['https://youtu.be/a', 'https://youtu.be/b'],
        websites: ['https://example.com/about'],
        pdfs: [],
        notes: ['First post', 'Second post'],
        search_wikipedia: false,
        style: 'Blunt',
      },
    })
  })

  it('asks for a name', () => {
    expect(buildMentorCreate(EMPTY_FIELDS)).toEqual({ error: 'Give the mentor a name.' })
  })

  it('explains that LinkedIn links must be pasted as text', () => {
    const result = buildMentorCreate({
      ...EMPTY_FIELDS,
      name: 'X',
      websites: 'https://www.linkedin.com/in/someone',
    })
    expect('error' in result && result.error).toMatch(/Paste the post text/)
  })

  it('rejects links that are not https', () => {
    const result = buildMentorCreate({ ...EMPTY_FIELDS, name: 'X', pdfs: 'http://a.test/x.pdf' })
    expect('error' in result && result.error).toMatch(/https/)
  })
})

describe('CreateMentorForm', () => {
  it('posts the mentor and hands back what the API returns', async () => {
    const created = { id: 'grace_hopper', name: 'Grace Hopper', memory: 'building' }
    const fetchMock = vi.fn<() => Promise<Response>>(() =>
      Promise.resolve(
        new Response(JSON.stringify(created), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onCreated = vi.fn<(mentor: unknown) => void>()
    const user = userEvent.setup()
    render(<CreateMentorForm onCreated={onCreated} onCancel={() => {}} />)

    await user.type(screen.getByLabelText('Name'), 'Grace Hopper')
    await user.type(screen.getByLabelText(/YouTube videos/), 'https://youtu.be/a')
    await user.click(screen.getByRole('button', { name: 'Create mentor' }))

    expect(onCreated).toHaveBeenCalledWith(created)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/mentors$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: 'Grace Hopper',
      youtube_videos: ['https://youtu.be/a'],
    })
  })

  it('shows what to fix without calling the API', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<CreateMentorForm onCreated={() => {}} onCancel={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Create mentor' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Give the mentor a name.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
