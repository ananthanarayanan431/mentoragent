import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_MESSAGE_CHARS } from '@/lib/config'
import type { ChatRequest, Mentor } from '@/lib/types'
import { DialogueBox } from './dialogue-box'

const sent = vi.hoisted(() => ({ requests: [] as ChatRequest[] }))

vi.mock('@/features/chat/use-chat-socket', () => ({
  useChatSocket: () => ({
    status: 'open',
    reconnect: () => {},
    send: (request: ChatRequest) => {
      sent.requests.push(request)
      return true
    },
  }),
}))

const ADA: Mentor = { id: 'ada', name: 'Ada', expertise: 'Engines', perspective: '', style: '' }

function renderBox() {
  const onClose = vi.fn<() => void>()
  const onMessageSent = vi.fn<() => void>()
  render(
    <MemoryRouter>
      <DialogueBox mentor={ADA} onClose={onClose} onMessageSent={onMessageSent} />
    </MemoryRouter>,
  )
  return { onClose, onMessageSent, input: screen.getByRole('textbox', { name: 'Message Ada' }) }
}

beforeEach(() => {
  window.localStorage.clear()
  sent.requests = []
})

describe('DialogueBox', () => {
  it('focuses the text box, sends on Enter and clears it', async () => {
    const user = userEvent.setup()
    const { input, onMessageSent } = renderBox()
    expect(input).toHaveFocus()

    await user.type(input, 'What is a moat?{Enter}')

    expect(sent.requests).toEqual([{ mentor_id: 'ada', message: 'What is a moat?' }])
    expect(onMessageSent).toHaveBeenCalledTimes(1)
    expect(input).toHaveValue('')
    expect(screen.getByText('What is a moat?')).toBeInTheDocument()
  })

  it('makes a new line with Shift+Enter instead of sending', async () => {
    const user = userEvent.setup()
    const { input } = renderBox()

    await user.type(input, 'line one{Shift>}{Enter}{/Shift}line two')

    expect(input).toHaveValue('line one\nline two')
    expect(sent.requests).toEqual([])
  })

  it('refuses blank and over-long messages', async () => {
    const user = userEvent.setup()
    const { input, onMessageSent } = renderBox()

    await user.type(input, '   {Enter}')
    expect(sent.requests).toEqual([])

    await user.clear(input)
    await user.click(input)
    await user.paste('x'.repeat(MAX_MESSAGE_CHARS + 1))
    await user.keyboard('{Enter}')

    expect(sent.requests).toEqual([])
    expect(onMessageSent).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('closes on Escape from anywhere, and with the close button', async () => {
    const user = userEvent.setup()
    const { onClose } = renderBox()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('lets Escape cancel an IME composition without closing', () => {
    const { onClose, input } = renderBox()
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('links to the same conversation on the full chat page', () => {
    renderBox()
    expect(screen.getByRole('link', { name: /full chat/i })).toHaveAttribute('href', '/chat/ada')
  })
})
