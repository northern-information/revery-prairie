import { Menu } from '../Menu'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const makeProps = (overrides: Partial<Parameters<typeof Menu>[0]> = {}) => ({
  onResume: vi.fn(),
  onNewGame: vi.fn(),
  metric: true,
  onToggleUnits: vi.fn(),
  musicEnabled: true,
  onToggleMusic: vi.fn(),
  autoHidePanels: true,
  onToggleAutoHidePanels: vi.fn(),
  fontScale: 1,
  onCycleFontScale: vi.fn(),
  ...overrides,
})

describe('Menu', () => {
  it('renders title and options', () => {
    render(<Menu {...makeProps()} />)

    expect(screen.getByText('Resume')).toBeInTheDocument()
    expect(screen.getByText('New Game')).toBeInTheDocument()
    expect(screen.getByText('Units: Metric')).toBeInTheDocument()
    expect(screen.getByText('A Tyler Etters game.')).toBeInTheDocument()
  })

  it('calls onResume when resume is clicked', async () => {
    const onResume = vi.fn()
    render(<Menu {...makeProps({ onResume })} />)

    await userEvent.click(screen.getByText('Resume'))

    expect(onResume).toHaveBeenCalledOnce()
  })

  it('shows confirmation before starting new game', async () => {
    const onNewGame = vi.fn()
    render(<Menu {...makeProps({ onNewGame })} />)

    await userEvent.click(screen.getByText('New Game'))

    expect(onNewGame).not.toHaveBeenCalled()
    expect(screen.getByText('Confirm?')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls onNewGame when confirmed', async () => {
    const onNewGame = vi.fn()
    render(<Menu {...makeProps({ onNewGame })} />)

    await userEvent.click(screen.getByText('New Game'))
    await userEvent.click(screen.getByText('Confirm?'))

    expect(onNewGame).toHaveBeenCalledOnce()
  })

  it('cancels new game confirmation', async () => {
    const onNewGame = vi.fn()
    render(<Menu {...makeProps({ onNewGame })} />)

    await userEvent.click(screen.getByText('New Game'))
    await userEvent.click(screen.getByText('Cancel'))

    expect(onNewGame).not.toHaveBeenCalled()
    expect(screen.getByText('New Game')).toBeInTheDocument()
  })

  it('shows imperial when metric is false', () => {
    render(<Menu {...makeProps({ metric: false })} />)

    expect(screen.getByText('Units: Imperial')).toBeInTheDocument()
  })

  it('calls onToggleUnits when units button is clicked', async () => {
    const onToggleUnits = vi.fn()
    render(<Menu {...makeProps({ onToggleUnits })} />)

    await userEvent.click(screen.getByText('Units: Metric'))

    expect(onToggleUnits).toHaveBeenCalledOnce()
  })

  it('shows music: on when musicEnabled is true', () => {
    render(<Menu {...makeProps({ musicEnabled: true })} />)

    expect(screen.getByText('Music: On')).toBeInTheDocument()
  })

  it('shows music: off when musicEnabled is false', () => {
    render(<Menu {...makeProps({ musicEnabled: false })} />)

    expect(screen.getByText('Music: Off')).toBeInTheDocument()
  })

  it('calls onToggleMusic when music button is clicked', async () => {
    const onToggleMusic = vi.fn()
    render(<Menu {...makeProps({ onToggleMusic })} />)

    await userEvent.click(screen.getByText('Music: On'))

    expect(onToggleMusic).toHaveBeenCalledOnce()
  })

  it('shows font: small when fontScale is 1', () => {
    render(<Menu {...makeProps({ fontScale: 1 })} />)

    expect(screen.getByText('Font: Small')).toBeInTheDocument()
  })

  it('calls onCycleFontScale when font button is clicked', async () => {
    const onCycleFontScale = vi.fn()
    render(<Menu {...makeProps({ onCycleFontScale })} />)

    await userEvent.click(screen.getByText('Font: Small'))

    expect(onCycleFontScale).toHaveBeenCalledOnce()
  })

})
