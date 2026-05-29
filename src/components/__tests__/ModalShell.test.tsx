import { ModalShell } from '../ModalShell'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

describe('ModalShell', () => {
  it('renders content into a portal with dialog semantics', () => {
    render(
      <ModalShell onDismiss={vi.fn()} ariaLabel="Test dialog" contentTestId="content">
        <p>body</p>
      </ModalShell>
    )

    const content = screen.getByTestId('content')
    expect(content).toHaveAttribute('role', 'dialog')
    expect(content).toHaveAttribute('aria-modal', 'true')
    expect(content).toHaveAttribute('aria-label', 'Test dialog')
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('dismisses on Escape by default', async () => {
    const onDismiss = vi.fn()
    render(
      <ModalShell onDismiss={onDismiss}>
        <p>body</p>
      </ModalShell>
    )

    await userEvent.keyboard('{Escape}')
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('dismisses on a custom key, case-insensitively', async () => {
    const onDismiss = vi.fn()
    render(
      <ModalShell onDismiss={onDismiss} dismissKey="f">
        <p>body</p>
      </ModalShell>
    )

    await userEvent.keyboard('F')
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('does not dismiss while canDismiss is false', async () => {
    const onDismiss = vi.fn()
    render(
      <ModalShell onDismiss={onDismiss} dismissKey="f" canDismiss={false}>
        <p>body</p>
      </ModalShell>
    )

    await userEvent.keyboard('f')
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses on backdrop click but not on content click', async () => {
    const onDismiss = vi.fn()
    render(
      <ModalShell onDismiss={onDismiss} data-testid="backdrop" contentTestId="content">
        <p>body</p>
      </ModalShell>
    )

    await userEvent.click(screen.getByTestId('content'))
    expect(onDismiss).not.toHaveBeenCalled()

    await userEvent.click(screen.getByTestId('backdrop'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('does not dismiss on backdrop click when dismissOnBackdropClick is false', async () => {
    const onDismiss = vi.fn()
    render(
      <ModalShell onDismiss={onDismiss} dismissOnBackdropClick={false} data-testid="backdrop">
        <p>body</p>
      </ModalShell>
    )

    await userEvent.click(screen.getByTestId('backdrop'))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('omits the scrim background when scrim is false', () => {
    render(
      <ModalShell onDismiss={vi.fn()} scrim={false} data-testid="backdrop">
        <p>body</p>
      </ModalShell>
    )

    expect(screen.getByTestId('backdrop').className).not.toContain('bg-black/70')
  })

  it('prefers aria-labelledby over aria-label when both are given', () => {
    render(
      <ModalShell onDismiss={vi.fn()} ariaLabel="fallback" ariaLabelledBy="heading-id" contentTestId="content">
        <h2 id="heading-id">Title</h2>
      </ModalShell>
    )

    const content = screen.getByTestId('content')
    expect(content).toHaveAttribute('aria-labelledby', 'heading-id')
    expect(content).not.toHaveAttribute('aria-label')
  })
})
