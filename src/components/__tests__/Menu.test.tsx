import { Menu } from '../Menu'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('Menu', () => {
  it('renders menu title and options', () => {
    render(<Menu onResume={vi.fn()} onNewGame={vi.fn()} />)

    expect(screen.getByText('menu')).toBeInTheDocument()
    expect(screen.getByText('resume')).toBeInTheDocument()
    expect(screen.getByText('new game')).toBeInTheDocument()
    expect(screen.getByText('[esc] close')).toBeInTheDocument()
  })

  it('calls onResume when resume is clicked', async () => {
    const onResume = vi.fn()
    render(<Menu onResume={onResume} onNewGame={vi.fn()} />)

    await userEvent.click(screen.getByText('resume'))

    expect(onResume).toHaveBeenCalledOnce()
  })

  it('calls onNewGame when new game is clicked', async () => {
    const onNewGame = vi.fn()
    render(<Menu onResume={vi.fn()} onNewGame={onNewGame} />)

    await userEvent.click(screen.getByText('new game'))

    expect(onNewGame).toHaveBeenCalledOnce()
  })
})
