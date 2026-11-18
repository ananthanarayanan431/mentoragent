import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api'
import { GOAL_MAX_CHARS } from '@/lib/config'
import { GoalPanel } from './goal-panel'

function renderPanel(
  goal: string | null,
  onSave = vi.fn<(goal: string) => Promise<void>>(async () => {}),
) {
  const onEditingChange = vi.fn<(editing: boolean) => void>()
  render(<GoalPanel goal={goal} onSave={onSave} onEditingChange={onEditingChange} />)
  return { onSave, onEditingChange }
}

describe('GoalPanel', () => {
  it('invites you to set a goal when there is none', () => {
    renderPanel(null)
    expect(screen.getByRole('button', { name: 'Set your goal' })).toBeInTheDocument()
  })

  it('shows the goal, with a way to change it', () => {
    renderPanel('Retire by 45')
    expect(screen.getByText('Retire by 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit your goal' })).toBeInTheDocument()
  })

  it('saves a new goal and says when editing starts and ends', async () => {
    const user = userEvent.setup()
    const { onSave, onEditingChange } = renderPanel(null)

    await user.click(screen.getByRole('button', { name: 'Set your goal' }))
    const input = screen.getByRole('textbox', { name: 'Your goal' })
    expect(input).toHaveFocus()
    expect(onEditingChange).toHaveBeenLastCalledWith(true)

    await user.type(input, 'Retire by 45{Enter}')

    expect(onSave).toHaveBeenCalledWith('Retire by 45')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(onEditingChange).toHaveBeenLastCalledWith(false)
  })

  it('keeps spaces and arrow keys inside the box', async () => {
    const user = userEvent.setup()
    renderPanel(null)
    await user.click(screen.getByRole('button', { name: 'Set your goal' }))
    const input = screen.getByRole('textbox', { name: 'Your goal' })

    await user.type(input, 'a b{ArrowLeft}c')

    expect(input).toHaveValue('a cb')
  })

  it('cancels with Escape and keeps the old goal', async () => {
    const user = userEvent.setup()
    const { onSave } = renderPanel('Retire by 45')
    await user.click(screen.getByRole('button', { name: 'Edit your goal' }))
    await user.clear(screen.getByRole('textbox', { name: 'Your goal' }))
    await user.keyboard('Something else{Escape}')

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Retire by 45')).toBeInTheDocument()
  })

  it('shows why saving failed and keeps the draft', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(goal: string) => Promise<void>>(async () => {
      throw new ApiError('Cannot reach the server.', 0)
    })
    renderPanel(null, onSave)
    await user.click(screen.getByRole('button', { name: 'Set your goal' }))
    await user.type(screen.getByRole('textbox', { name: 'Your goal' }), 'Retire by 45{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.')
    expect(screen.getByRole('textbox', { name: 'Your goal' })).toHaveValue('Retire by 45')
  })

  it('will not save a blank goal or one over the limit', async () => {
    const user = userEvent.setup()
    const { onSave } = renderPanel(null)
    await user.click(screen.getByRole('button', { name: 'Set your goal' }))
    const input = screen.getByRole('textbox', { name: 'Your goal' })

    await user.type(input, '   {Enter}')
    await user.clear(input)
    await user.click(input)
    await user.paste('x'.repeat(GOAL_MAX_CHARS + 1))

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })
})
