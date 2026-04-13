import { CantosScreen } from '../CantosScreen'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ANGEL_CANTOS_MAX } from '@/engine/constants'

describe('CantosScreen', () => {
  it('renders empty state message when no cantos', () => {
    render(<CantosScreen cantos={[]} />)

    expect(screen.getByText(/no cantos received/i)).toBeInTheDocument()
  })

  it('renders the 8x8 grid when cantos exist', () => {
    render(<CantosScreen cantos={['abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234']} />)

    const grid = screen.getByTestId('cantos-grid')
    expect(grid).toBeInTheDocument()
    // 64 cells total
    expect(grid.children).toHaveLength(ANGEL_CANTOS_MAX)
  })

  it('shows truncated hash in filled cells', () => {
    render(<CantosScreen cantos={['abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234']} />)

    const cell = screen.getByTestId('canto-cell-0')
    expect(cell.textContent).toBe('abcd')
  })

  it('shows placeholder in empty cells', () => {
    render(<CantosScreen cantos={['abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234']} />)

    const emptyCell = screen.getByTestId('canto-cell-1')
    expect(emptyCell.textContent).toBe('\u00b7') // middle dot
  })

  it('displays full hash on hover', async () => {
    const hash = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234'
    render(<CantosScreen cantos={[hash]} />)

    const cell = screen.getByTestId('canto-cell-0')
    await userEvent.hover(cell)

    const fullHash = screen.getByTestId('canto-full-hash')
    expect(fullHash).toBeInTheDocument()
    expect(fullHash.textContent).toContain(hash)
  })

  it('hides full hash on mouse leave', async () => {
    const hash = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234'
    render(<CantosScreen cantos={[hash]} />)

    const cell = screen.getByTestId('canto-cell-0')
    await userEvent.hover(cell)
    await userEvent.unhover(cell)

    expect(screen.queryByTestId('canto-full-hash')).not.toBeInTheDocument()
  })

  it('shows the count header', () => {
    render(<CantosScreen cantos={['a'.repeat(64), 'b'.repeat(64)]} />)

    expect(screen.getByText(/2\/64/)).toBeInTheDocument()
  })

  it('empty cells are not focusable', () => {
    render(<CantosScreen cantos={['a'.repeat(64)]} />)

    const emptyCell = screen.getByTestId('canto-cell-1')
    expect(emptyCell).toHaveAttribute('tabindex', '-1')
  })

  it('filled cells are focusable', () => {
    render(<CantosScreen cantos={['a'.repeat(64)]} />)

    const filledCell = screen.getByTestId('canto-cell-0')
    expect(filledCell).toHaveAttribute('tabindex', '0')
  })
})
