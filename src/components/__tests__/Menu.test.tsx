import { Menu } from '../Menu'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('Menu', () => {
  it('renders title and options', () => {
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={vi.fn()}
        metric={true}
        onToggleUnits={vi.fn()}
        musicEnabled={true}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    expect(screen.getByText('resume')).toBeInTheDocument()
    expect(screen.getByText('new game')).toBeInTheDocument()
    expect(screen.getByText('units: metric')).toBeInTheDocument()
    expect(screen.getByText('a tyler etters game')).toBeInTheDocument()
  })

  it('calls onResume when resume is clicked', async () => {
    const onResume = vi.fn()
    render(
      <Menu
        onResume={onResume}
        onNewGame={vi.fn()}
        metric={true}
        onToggleUnits={vi.fn()}
        musicEnabled={true}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    await userEvent.click(screen.getByText('resume'))

    expect(onResume).toHaveBeenCalledOnce()
  })

  it('shows confirmation before starting new game', async () => {
    const onNewGame = vi.fn()
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={onNewGame}
        metric={true}
        onToggleUnits={vi.fn()}
        musicEnabled={true}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    await userEvent.click(screen.getByText('new game'))

    expect(onNewGame).not.toHaveBeenCalled()
    expect(screen.getByText('confirm?')).toBeInTheDocument()
    expect(screen.getByText('cancel')).toBeInTheDocument()
  })

  it('calls onNewGame when confirmed', async () => {
    const onNewGame = vi.fn()
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={onNewGame}
        metric={true}
        onToggleUnits={vi.fn()}
        musicEnabled={true}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    await userEvent.click(screen.getByText('new game'))
    await userEvent.click(screen.getByText('confirm?'))

    expect(onNewGame).toHaveBeenCalledOnce()
  })

  it('cancels new game confirmation', async () => {
    const onNewGame = vi.fn()
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={onNewGame}
        metric={true}
        onToggleUnits={vi.fn()}
        musicEnabled={true}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    await userEvent.click(screen.getByText('new game'))
    await userEvent.click(screen.getByText('cancel'))

    expect(onNewGame).not.toHaveBeenCalled()
    expect(screen.getByText('new game')).toBeInTheDocument()
  })

  it('shows imperial when metric is false', () => {
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={vi.fn()}
        metric={false}
        onToggleUnits={vi.fn()}
        musicEnabled={true}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    expect(screen.getByText('units: imperial')).toBeInTheDocument()
  })

  it('calls onToggleUnits when units button is clicked', async () => {
    const onToggleUnits = vi.fn()
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={vi.fn()}
        metric={true}
        onToggleUnits={onToggleUnits}
        musicEnabled={true}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    await userEvent.click(screen.getByText('units: metric'))

    expect(onToggleUnits).toHaveBeenCalledOnce()
  })

  it('shows music: on when musicEnabled is true', () => {
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={vi.fn()}
        metric={true}
        onToggleUnits={vi.fn()}
        musicEnabled={true}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    expect(screen.getByText('music: on')).toBeInTheDocument()
  })

  it('shows music: off when musicEnabled is false', () => {
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={vi.fn()}
        metric={true}
        onToggleUnits={vi.fn()}
        musicEnabled={false}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    expect(screen.getByText('music: off')).toBeInTheDocument()
  })

  it('calls onToggleMusic when music button is clicked', async () => {
    const onToggleMusic = vi.fn()
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={vi.fn()}
        metric={true}
        onToggleUnits={vi.fn()}
        musicEnabled={true}
        onToggleMusic={onToggleMusic}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    await userEvent.click(screen.getByText('music: on'))

    expect(onToggleMusic).toHaveBeenCalledOnce()
  })

  it('shows font: small when fontScale is 1', () => {
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={vi.fn()}
        metric={true}
        onToggleUnits={vi.fn()}
        musicEnabled={true}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={vi.fn()}
      />
    )

    expect(screen.getByText('font: small')).toBeInTheDocument()
  })

  it('calls onCycleFontScale when font button is clicked', async () => {
    const onCycleFontScale = vi.fn()
    render(
      <Menu
        onResume={vi.fn()}
        onNewGame={vi.fn()}
        metric={true}
        onToggleUnits={vi.fn()}
        musicEnabled={true}
        onToggleMusic={vi.fn()}
        fontScale={1}
        onCycleFontScale={onCycleFontScale}
      />
    )

    await userEvent.click(screen.getByText('font: small'))

    expect(onCycleFontScale).toHaveBeenCalledOnce()
  })
})
