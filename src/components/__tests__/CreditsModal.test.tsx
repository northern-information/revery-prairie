import { CreditsModal } from '../CreditsModal'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Credit } from '@/engine/credits'

describe('credits modal', () => {
  it('renders the empty state when credits is empty', () => {
    render(<CreditsModal credits={[]} onClose={vi.fn()} />)
    expect(screen.getByText(/no credits yet/i)).toBeInTheDocument()
  })

  it('renders one row per credit with name and role', () => {
    const credits: Credit[] = [
      { name: 'Alice', role: 'Engineer' },
      { name: 'Bob', role: 'Artist' },
    ]
    render(<CreditsModal credits={credits} onClose={vi.fn()} />)

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Engineer')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Artist')).toBeInTheDocument()
  })

  it('renders rows in array order', () => {
    const credits: Credit[] = [
      { name: 'First', role: 'a' },
      { name: 'Second', role: 'b' },
      { name: 'Third', role: 'c' },
    ]
    render(<CreditsModal credits={credits} onClose={vi.fn()} />)

    const items = screen.getAllByRole('listitem')
    expect(items[0]?.textContent).toContain('First')
    expect(items[1]?.textContent).toContain('Second')
    expect(items[2]?.textContent).toContain('Third')
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    render(<CreditsModal credits={[]} onClose={onClose} />)

    await userEvent.click(screen.getByLabelText(/close credits/i))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<CreditsModal credits={[]} onClose={onClose} />)

    await userEvent.click(screen.getByTestId('credits-modal-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onClose when the inner modal is clicked', async () => {
    const onClose = vi.fn()
    render(<CreditsModal credits={[{ name: 'A', role: 'B' }]} onClose={onClose} />)

    await userEvent.click(screen.getByTestId('credits-modal'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose on Escape key', async () => {
    const onClose = vi.fn()
    render(<CreditsModal credits={[]} onClose={onClose} />)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cancels the auto-scroll rAF on unmount', () => {
    const credits: Credit[] = Array.from({ length: 50 }, (_, i) => ({
      name: `n${String(i)}`,
      role: 'r',
    }))

    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    const clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 200 })
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')

    try {
      const { unmount } = render(<CreditsModal credits={credits} onClose={vi.fn()} />)
      unmount()
      expect(cancelSpy).toHaveBeenCalled()
    } finally {
      cancelSpy.mockRestore()
      if (scrollHeightDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeightDescriptor)
      if (clientHeightDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor)
    }
  })
})
