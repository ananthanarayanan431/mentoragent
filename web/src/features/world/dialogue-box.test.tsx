import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_MESSAGE_CHARS } from '@/lib/config'
import type { ClientMessage, Mentor, ServerEvent } from '@/lib/types'
import { DialogueBox } from './dialogue-box'
import { levelFor } from './progress'

const sent = vi.hoisted(() => ({
  requests: [] as ClientMessage[],
  onEvent: (() => {}) as (event: ServerEvent) => void,
}))

vi.mock('@/features/chat/use-chat-socket', () => ({
  useChatSocket: ({ onEvent }: { onEvent: (event: ServerEvent) => void }) => {
    sent.onEvent = onEvent
    return {
      status: 'open',
      reconnect: () => {},
      send: (request: ClientMessage) => {
        sent.requests.push(request)
        return true
      },
    }
  },
}))

const REPLY = 'A moat is a durable advantage that keeps rivals out.'

/** The server answers the last message in full, in one go. */
function reply(content: string = REPLY) {
  act(() => {
    sent.onEvent({ type: 'start', conversation_id: 'c1' })
    sent.onEvent({ type: 'chunk', content })
    sent.onEvent({ type: 'end', conversation_id: 'c1', response: content })
  })
}

/** The mentor's visible line (the typed-out text, not the screen-reader copy). */
function spokenLine(): string {
  return document.querySelector('.prose-reply')?.textContent ?? ''
}

const ADA: Mentor = { id: 'ada', name: 'Ada', expertise: 'Engines', perspective: '', style: '' }

/** What was sent as real messages (not requests to speak first). */
function chatMessages() {
  return sent.requests.filter((request) => 'message' in request)
}

/** The mentor answers a request to speak first with silence. */
function silent() {
  act(() => sent.onEvent({ type: 'silent', conversation_id: null }))
}

/**
 * Renders the box. Unless `opener` is 'pending', the mentor's request to speak first
 * is answered with silence, as when nobody else has given advice yet.
 */
function renderBox(
  mentor: Mentor = ADA,
  { opener = 'silent' }: { opener?: 'silent' | 'pending' } = {},
) {
  const onClose = vi.fn<() => void>()
  const onMessageSent = vi.fn<() => void>()
  const view = (m: Mentor) => (
    <MemoryRouter>
      <DialogueBox mentor={m} level={levelFor(3)} onClose={onClose} onMessageSent={onMessageSent} />
    </MemoryRouter>
  )
  const { rerender } = render(view(mentor))
  if (opener === 'silent' && mentor.memory !== 'building') silent()
  return {
    onClose,
    onMessageSent,
    rerender: (m: Mentor) => rerender(view(m)),
    input: screen.getByRole('textbox', { name: 'Message Ada' }),
  }
}

beforeEach(() => {
  window.localStorage.clear()
  sent.requests = []
})

describe('DialogueBox', () => {
  it('asks the mentor once to speak first, and types out what they say', async () => {
    renderBox(ADA, { opener: 'pending' })

    expect(sent.requests).toEqual([{ mentor_id: 'ada', opener: true }])
    reply('I hear Charlie told you to concentrate.')
    await userEvent.setup().keyboard(' ')

    expect(spokenLine()).toBe('I hear Charlie told you to concentrate.')
    expect(screen.queryByText(/You:/)).not.toBeInTheDocument()
  })

  it('keeps the greeting when the mentor has nothing new to say', async () => {
    renderBox()

    expect(
      await screen.findByText(/What would you like to talk about/, {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Thinking')).not.toBeInTheDocument()
  })

  it('does not ask a mentor who is still reading up to speak first', () => {
    renderBox({ ...ADA, memory: 'building' })
    expect(sent.requests).toEqual([])
  })

  it('greets the player, then shows thinking dots while the mentor works on a reply', async () => {
    const user = userEvent.setup()
    const { input } = renderBox()
    // The greeting types itself out too.
    expect(
      await screen.findByText(/What would you like to talk about/, {}, { timeout: 3000 }),
    ).toBeInTheDocument()

    await user.type(input, 'What is a moat?{Enter}')

    expect(screen.getByText('What is a moat?')).toBeInTheDocument()
    expect(screen.getByLabelText('Thinking')).toBeInTheDocument()
  })

  it('types the reply out, and Space on an empty box shows the rest at once', async () => {
    const user = userEvent.setup()
    const { input } = renderBox()
    await user.type(input, 'What is a moat?{Enter}')
    reply()

    expect(spokenLine().length).toBeLessThan(REPLY.length)
    expect(screen.getByText(/Space: skip/)).toBeInTheDocument()

    await user.keyboard(' ')

    expect(spokenLine()).toBe(REPLY)
    expect(input).toHaveValue('')
    expect(screen.getByText('▼')).toBeInTheDocument()
    expect(screen.queryByText(/Space: skip/)).not.toBeInTheDocument()
  })

  it('finishes typing on its own, and gives screen readers the whole line once', async () => {
    const user = userEvent.setup()
    const { input } = renderBox()
    await user.type(input, 'Hi{Enter}')
    reply('Hello there.')

    expect(await screen.findByText('▼')).toBeInTheDocument()
    expect(spokenLine()).toBe('Hello there.')
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Hello there.')
  })

  it('shows only the newest exchange, and the whole conversation in the log', async () => {
    const user = userEvent.setup()
    const { input } = renderBox()
    await user.type(input, 'First question{Enter}')
    reply('First answer.')
    await user.keyboard(' ')
    await user.type(input, 'Second question{Enter}')
    reply('Second answer.')

    expect(screen.queryByText('First question')).not.toBeInTheDocument()
    expect(screen.getByText('Second question')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Log' }))

    expect(screen.getByText('First question')).toBeInTheDocument()
    expect(screen.getByText('First answer.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('locks the text box while the memory builds, and opens it once ready', async () => {
    const user = userEvent.setup()
    const building: Mentor = { ...ADA, memory: 'building' }
    const { input, rerender } = renderBox(building)

    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByText(/still reading up on their own work/)).toBeInTheDocument()

    rerender({ ...ADA, memory: 'ready' })
    // Once ready, the mentor is asked to speak first; here they have nothing to say.
    expect(sent.requests).toEqual([{ mentor_id: 'ada', opener: true }])
    silent()
    expect(input).toBeEnabled()
    expect(input).toHaveFocus()
    expect(screen.queryByText(/still reading up/)).not.toBeInTheDocument()

    await user.type(input, 'Hello{Enter}')
    expect(chatMessages()).toEqual([{ mentor_id: 'ada', message: 'Hello' }])
  })

  it('still allows talking when the memory build failed', () => {
    const { input } = renderBox({ ...ADA, memory: 'failed' })
    expect(input).toBeEnabled()
    expect(screen.getByText(/background reading failed/)).toBeInTheDocument()
  })

  it('focuses the text box, sends on Enter and clears it', async () => {
    const user = userEvent.setup()
    const { input, onMessageSent } = renderBox()
    expect(input).toHaveFocus()

    await user.type(input, 'What is a moat?{Enter}')

    expect(chatMessages()).toEqual([{ mentor_id: 'ada', message: 'What is a moat?' }])
    expect(onMessageSent).toHaveBeenCalledTimes(1)
    expect(input).toHaveValue('')
    expect(screen.getByText('What is a moat?')).toBeInTheDocument()
  })

  it('makes a new line with Shift+Enter instead of sending', async () => {
    const user = userEvent.setup()
    const { input } = renderBox()

    await user.type(input, 'line one{Shift>}{Enter}{/Shift}line two')

    expect(input).toHaveValue('line one\nline two')
    expect(chatMessages()).toEqual([])
  })

  it('refuses blank and over-long messages', async () => {
    const user = userEvent.setup()
    const { input, onMessageSent } = renderBox()

    await user.type(input, '   {Enter}')
    expect(chatMessages()).toEqual([])

    await user.clear(input)
    await user.click(input)
    await user.paste('x'.repeat(MAX_MESSAGE_CHARS + 1))
    await user.keyboard('{Enter}')

    expect(chatMessages()).toEqual([])
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

  it('shows the friendship level and progress', () => {
    renderBox()
    expect(screen.getByText('Lv 2 · Regular')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Friendship with Ada' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
  })

  it('says when the mentor is still building or failed to build their memory', () => {
    renderBox({ ...ADA, memory: 'failed' })
    expect(screen.getByText(/background reading failed/)).toBeInTheDocument()
  })

  it('links to the same conversation on the full chat page', () => {
    renderBox()
    expect(screen.getByRole('link', { name: /full chat/i })).toHaveAttribute('href', '/chat/ada')
  })
})
