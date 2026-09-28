import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, deleteConversation, listMentors, sendChat } from './api'

function mockFetch(response: Response | Promise<never>) {
  const fetchMock = vi.fn(() => (response instanceof Response ? Promise.resolve(response) : response))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('listMentors', () => {
  it('returns the parsed body', async () => {
    const mentor = {
      id: 'ada',
      name: 'Ada Lovelace',
      expertise: 'Computing',
      perspective: 'Analytical',
      style: 'Precise',
      image_url: null,
    }
    const fetchMock = mockFetch(json([mentor]))

    await expect(listMentors()).resolves.toEqual([mentor])
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/mentors', expect.anything())
  })
})

describe('error handling', () => {
  it('reports an unreachable backend rather than leaking the fetch error', async () => {
    mockFetch(Promise.reject(new TypeError('Failed to fetch')))

    const error = await listMentors().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).isOffline).toBe(true)
    expect((error as ApiError).message).toMatch(/Cannot reach the server/)
  })

  it('uses the detail string from a FastAPI error body', async () => {
    mockFetch(json({ detail: 'Mentor with id nope not found' }, 404))

    const error = await listMentors().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).message).toBe('Mentor with id nope not found')
  })

  it('joins the messages of a validation error list', async () => {
    mockFetch(json({ detail: [{ msg: 'too long' }, { msg: 'must not be empty' }] }, 422))

    const error = await sendChat({ mentor_id: 'ada', message: '' }).catch((e: unknown) => e)
    expect((error as ApiError).message).toBe('too long; must not be empty')
  })

  it('falls back to a status message when the body says nothing useful', async () => {
    mockFetch(json({}, 503))

    const error = await listMentors().catch((e: unknown) => e)
    expect((error as ApiError).message).toBe('The service is temporarily unavailable.')
  })

  it('survives an error response that is not JSON', async () => {
    mockFetch(new Response('<html>502</html>', { status: 502 }))

    const error = await listMentors().catch((e: unknown) => e)
    expect((error as ApiError).message).toBe('Request failed (502).')
  })
})

describe('deleteConversation', () => {
  it('handles a 204 with no body and escapes the path segments', async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }))

    await expect(deleteConversation('a b', 'c/1')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/conversations/a%20b/c%2F1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
