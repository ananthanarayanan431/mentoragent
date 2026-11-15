import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { LedgerLine } from '@/lib/types'
import { LEDGER_LINES_SHOWN, LedgerList } from './ledger-list'

function line(n: number): LedgerLine {
  return {
    id: `l${n}`,
    mentor_id: 'warren_buffett',
    mentor_name: 'Warren Buffett',
    topic: `topic ${n}`,
    advice: `Advice number ${n}.`,
    created_at: '2026-11-15T10:00:00Z',
  }
}

describe('LedgerList', () => {
  it('says how advice will show up before there is any', () => {
    render(<LedgerList lines={[]} error="" onForget={vi.fn<(id: string) => void>()} />)
    expect(screen.getByText(/their advice shows up here/i)).toBeInTheDocument()
  })

  it('shows who said what, newest first, and only the newest few', () => {
    const lines = Array.from({ length: LEDGER_LINES_SHOWN + 3 }, (_, i) => line(i))
    render(<LedgerList lines={lines} error="" onForget={vi.fn<(id: string) => void>()} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(LEDGER_LINES_SHOWN)
    expect(items[0]).toHaveTextContent('Warren Buffett')
    expect(items[0]).toHaveTextContent('topic 0')
    expect(items[0]).toHaveTextContent('Advice number 0.')
  })

  it('forgets a line', async () => {
    const user = userEvent.setup()
    const onForget = vi.fn<(id: string) => void>()
    render(<LedgerList lines={[line(1)]} error="" onForget={onForget} />)

    await user.click(screen.getByRole('button', { name: 'Forget this advice from Warren Buffett' }))

    expect(onForget).toHaveBeenCalledWith('l1')
  })

  it('shows why forgetting failed', () => {
    render(
      <LedgerList
        lines={[line(1)]}
        error="Cannot reach the server."
        onForget={vi.fn<(id: string) => void>()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.')
  })
})
