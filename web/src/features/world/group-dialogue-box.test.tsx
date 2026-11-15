import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientMessage, Mentor, ServerEvent } from '@/lib/types'
import { GroupDialogueBox } from './group-dialogue-box'

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

const mentor = (id: string, name: string): Mentor => ({
  id,
  name,
  expertise: 'e',
  perspective: 'p',
  style: 's',
  memory: 'ready',
})
const BUFFETT = mentor('buffett', 'Warren Buffett')
const MUNGER = mentor('munger', 'Charlie Munger')
const LINES = [
  { mentorId: 'buffett', text: 'Our friend should buy index funds.' },
  { mentorId: 'munger', text: 'Agreed, and avoid fees.' },
]

function renderBox() {
  const onClose = vi.fn<() => void>()
  const onMessageSent = vi.fn<() => void>()
  render(
    <GroupDialogueBox
      mentors={[BUFFETT, MUNGER]}
      ambientId="amb1"
      ambientLines={LINES}
      onClose={onClose}
      onMessageSent={onMessageSent}
    />,
  )
  return {
    onClose,
    onMessageSent,
    input: screen.getByRole('textbox', { name: /message warren buffett and charlie munger/i }),
  }
}

/** Both mentors answer the last message, in one go. */
function answer() {
  act(() => {
    for (const [mentorId, text] of [
      ['buffett', 'Mostly index funds.'],
      ['munger', 'And never pay high fees.'],
    ] as const) {
      sent.onEvent({ type: 'start', conversation_id: 'c1', mentor_id: mentorId })
      sent.onEvent({ type: 'end', conversation_id: 'c1', response: text, mentor_id: mentorId })
    }
    sent.onEvent({ type: 'turn_end', conversation_id: 'c1' })
  })
}

function spokenLine(): string {
  return document.querySelector('.prose-reply')?.textContent ?? ''
}

beforeEach(() => {
  window.localStorage.clear()
  sent.requests = []
})

describe('GroupDialogueBox', () => {
  it('opens on what the two mentors were saying', () => {
    renderBox()
    expect(
      screen.getByRole('dialog', { name: 'Conversation with Warren Buffett and Charlie Munger' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Our friend should buy index funds.')).toBeInTheDocument()
    expect(screen.getByText('Agreed, and avoid fees.')).toBeInTheDocument()
  })

  it('sends to both, then shows one speaker at a time, Space to move on', async () => {
    const user = userEvent.setup()
    const { input, onMessageSent } = renderBox()

    await user.type(input, 'How should I invest?{Enter}')
    expect(sent.requests).toEqual([
      { mentor_ids: ['buffett', 'munger'], message: 'How should I invest?', ambient_id: 'amb1' },
    ])
    expect(onMessageSent).toHaveBeenCalledTimes(1)
    answer()

    await user.keyboard(' ') // finish typing Buffett's line
    expect(spokenLine()).toBe('Mostly index funds.')
    expect(screen.getByTestId('speaker')).toHaveTextContent('Warren Buffett')

    await user.keyboard(' ') // on to Munger
    await user.keyboard(' ') // finish typing his line
    expect(spokenLine()).toBe('And never pay high fees.')
    expect(screen.getByTestId('speaker')).toHaveTextContent('Charlie Munger')
  })

  it('shows the whole conversation, each line under its speaker, in the log', async () => {
    const user = userEvent.setup()
    const { input } = renderBox()
    await user.type(input, 'How should I invest?{Enter}')
    answer()

    await user.click(screen.getByRole('button', { name: 'Log' }))

    expect(screen.getByText('Mostly index funds.')).toBeInTheDocument()
    expect(screen.getByText('And never pay high fees.')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const { onClose } = renderBox()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
