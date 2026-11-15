import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api'
import type { LedgerLine } from '@/lib/types'
import { LEDGER_REFRESH_DELAY_MS, useLedger } from './use-ledger'

const api = vi.hoisted(() => ({
  listLedger: vi.fn<() => Promise<LedgerLine[]>>(),
  deleteLedgerLine: vi.fn<(id: string) => Promise<void>>(),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listLedger: api.listLedger,
  deleteLedgerLine: api.deleteLedgerLine,
}))

function line(id: string, topic = 'index funds'): LedgerLine {
  return {
    id,
    mentor_id: 'warren_buffett',
    mentor_name: 'Warren Buffett',
    topic,
    advice: 'Recommends index funds.',
    created_at: '2026-11-15T10:00:00Z',
  }
}

beforeEach(() => {
  api.listLedger.mockResolvedValue([line('a'), line('b')])
  api.deleteLedgerLine.mockResolvedValue()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLedger', () => {
  it('loads the ledger', async () => {
    const { result } = renderHook(() => useLedger())
    await waitFor(() => expect(result.current.lines.map((l) => l.id)).toEqual(['a', 'b']))
  })

  it('forgets a line at once, and on the server', async () => {
    const { result } = renderHook(() => useLedger())
    await waitFor(() => expect(result.current.lines).toHaveLength(2))

    await act(() => result.current.forget('a'))

    expect(result.current.lines.map((l) => l.id)).toEqual(['b'])
    expect(api.deleteLedgerLine).toHaveBeenCalledWith('a')
    expect(result.current.error).toBe('')
  })

  it('puts a line back and says why when it cannot be forgotten', async () => {
    api.deleteLedgerLine.mockRejectedValue(new ApiError('Cannot reach the server.', 0))
    const { result } = renderHook(() => useLedger())
    await waitFor(() => expect(result.current.lines).toHaveLength(2))

    await act(() => result.current.forget('a'))

    expect(result.current.lines.map((l) => l.id)).toEqual(['a', 'b'])
    expect(result.current.error).toBe('Cannot reach the server.')
  })

  it('treats a line that is already gone as forgotten', async () => {
    api.deleteLedgerLine.mockRejectedValue(new ApiError('Not found.', 404))
    const { result } = renderHook(() => useLedger())
    await waitFor(() => expect(result.current.lines).toHaveLength(2))

    await act(() => result.current.forget('a'))

    expect(result.current.lines.map((l) => l.id)).toEqual(['b'])
    expect(result.current.error).toBe('')
  })

  it('reloads shortly after asked, once the new advice has been noted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => useLedger())
    await waitFor(() => expect(result.current.lines).toHaveLength(2))
    api.listLedger.mockResolvedValue([line('c'), line('a'), line('b')])

    act(() => result.current.refreshSoon())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LEDGER_REFRESH_DELAY_MS)
    })

    await waitFor(() => expect(result.current.lines.map((l) => l.id)).toEqual(['c', 'a', 'b']))
  })
})
