import { Menu } from '../Menu'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('Menu', () => {
  it('renders title and options', () => {
    render(<Menu onResume={vi.fn()} onNewGame={vi.fn()} metric={true} onToggleUnits={vi.fn()} />)

    expect(screen.getByText('revery prairie')).toBeInTheDocument()
    expect(screen.getByText('resume')).toBeInTheDocument()
    expect(screen.getByText('new game')).toBeInTheDocument()
    expect(screen.getByText('units: metric')).toBeInTheDocument()
    expect(screen.getByText('a tyler etters game')).toBeInTheDocument()
  })

  it('calls onResume when resume is clicked', async () => {
    const onResume = vi.fn()
    render(<Menu onResume={onResume} onNewGame={vi.fn()} metric={true} onToggleUnits={vi.fn()} />)

    await userEvent.click(screen.getByText('resume'))

    expect(onResume).toHaveBeenCalledOnce()
  })

  it('shows confirmation before starting new game', async () => {
    const onNewGame = vi.fn()
    render(<Menu onResume={vi.fn()} onNewGame={onNewGame} metric={true} onToggleUnits={vi.fn()} />)

    await userEvent.click(screen.getByText('new game'))

    expect(onNewGame).not.toHaveBeenCalled()
    expect(screen.getByText('confirm?')).toBeInTheDocument()
    expect(screen.getByText('cancel')).toBeInTheDocument()
  })

  it('calls onNewGame when confirmed', async () => {
    const onNewGame = vi.fn()
    render(<Menu onResume={vi.fn()} onNewGame={onNewGame} metric={true} onToggleUnits={vi.fn()} />)

    await userEvent.click(screen.getByText('new game'))
    await userEvent.click(screen.getByText('confirm?'))

    expect(onNewGame).toHaveBeenCalledOnce()
  })

  it('cancels new game confirmation', async () => {
    const onNewGame = vi.fn()
    render(<Menu onResume={vi.fn()} onNewGame={onNewGame} metric={true} onToggleUnits={vi.fn()} />)

    await userEvent.click(screen.getByText('new game'))
    await userEvent.click(screen.getByText('cancel'))

    expect(onNewGame).not.toHaveBeenCalled()
    expect(screen.getByText('new game')).toBeInTheDocument()
  })

  it('shows imperial when metric is false', () => {
    render(<Menu onResume={vi.fn()} onNewGame={vi.fn()} metric={false} onToggleUnits={vi.fn()} />)

    expect(screen.getByText('units: imperial')).toBeInTheDocument()
  })

  it('calls onToggleUnits when units button is clicked', async () => {
    const onToggleUnits = vi.fn()
    render(<Menu onResume={vi.fn()} onNewGame={vi.fn()} metric={true} onToggleUnits={onToggleUnits} />)

    await userEvent.click(screen.getByText('units: metric'))

    expect(onToggleUnits).toHaveBeenCalledOnce()
  })

  it('calls onResume when clicking outside the menu', async () => {
    const onResume = vi.fn()
    render(<Menu onResume={onResume} onNewGame={vi.fn()} metric={true} onToggleUnits={vi.fn()} />)

    // Click the backdrop (the outer fixed div wrapping the menu)
    const backdrop = screen.getByText('resume').closest('[class*="fixed inset-0"]')!
    await userEvent.click(backdrop)

    expect(onResume).toHaveBeenCalledOnce()
  })
})
