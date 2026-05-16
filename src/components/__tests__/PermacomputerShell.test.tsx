import { PermacomputerShell } from '../PermacomputerShell'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('PermacomputerShell', () => {
  const defaultProps = {
    activeScreen: 'pack' as const,
    onClose: vi.fn(),
    onSwitchScreen: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all tab labels', () => {
    render(
      <PermacomputerShell {...defaultProps}>
        <div>content</div>
      </PermacomputerShell>
    )

    expect(screen.getByText('PACK')).toBeInTheDocument()
    expect(screen.getByText('MANUAL')).toBeInTheDocument()
    expect(screen.getByText('REVERIES')).toBeInTheDocument()
    expect(screen.getByText('DIVINATION')).toBeInTheDocument()
    expect(screen.getByText('SYS')).toBeInTheDocument()
  })

  it('renders children in the content area', () => {
    render(
      <PermacomputerShell {...defaultProps}>
        <div>test content</div>
      </PermacomputerShell>
    )

    expect(screen.getByText('test content')).toBeInTheDocument()
  })

  it('calls onSwitchScreen when a tab is clicked', async () => {
    const onSwitchScreen = vi.fn()
    render(
      <PermacomputerShell {...defaultProps} onSwitchScreen={onSwitchScreen}>
        <div>content</div>
      </PermacomputerShell>
    )

    await userEvent.click(screen.getByTestId('tab-manual'))
    expect(onSwitchScreen).toHaveBeenCalledWith('manual')
  })

  it('calls onClose when backdrop is clicked (non-pack screen)', async () => {
    const onClose = vi.fn()
    render(
      <PermacomputerShell {...defaultProps} activeScreen="manual" onClose={onClose}>
        <div>content</div>
      </PermacomputerShell>
    )

    await userEvent.click(screen.getByTestId('permacomputer-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close on backdrop click when pack screen is active', async () => {
    const onClose = vi.fn()
    render(
      <PermacomputerShell {...defaultProps} activeScreen="pack" onClose={onClose}>
        <div>content</div>
      </PermacomputerShell>
    )

    // Backdrop has pointer-events-none on pack screen, so click goes through
    await userEvent.click(screen.getByTestId('permacomputer-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders the permacomputer glyph', () => {
    render(
      <PermacomputerShell {...defaultProps}>
        <div>content</div>
      </PermacomputerShell>
    )

    expect(screen.getByTestId('permacomputer-shell')).toBeInTheDocument()
  })

  // Bottom bar (GameScreen) is fixed bottom-2 h-48 (~200px). Shell and backdrop must
  // stop short of it via bottom-52 so the minimap and event log stay clickable.
  it('reserves space at the bottom for the minimap and event log', () => {
    render(
      <PermacomputerShell {...defaultProps} activeScreen="manual">
        <div>content</div>
      </PermacomputerShell>
    )

    expect(screen.getByTestId('permacomputer-shell').className).toContain('bottom-52')
    expect(screen.getByTestId('permacomputer-backdrop').className).toContain('bottom-52')
  })
})
