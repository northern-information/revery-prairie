import { CantosScreen } from '../CantosScreen'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('CantosScreen', () => {
  it('renders empty state message when no cantos', () => {
    render(<CantosScreen cantos={[]} />)

    expect(screen.getByText(/no cantos received/i)).toBeInTheDocument()
  })

  it('renders one cell per canto', () => {
    render(<CantosScreen cantos={['ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234']} />)

    const grid = screen.getByTestId('cantos-grid')
    expect(grid).toBeInTheDocument()
    expect(grid.children).toHaveLength(1)
  })

  it('shows first hex char in cells', () => {
    render(<CantosScreen cantos={['ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234']} />)

    const cell = screen.getByTestId('canto-cell-0')
    expect(cell.textContent).toBe('A')
  })

  it('displays full hash as 8x8 grid on hover', async () => {
    const hash = 'ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234'
    render(<CantosScreen cantos={[hash]} />)

    const cell = screen.getByTestId('canto-cell-0')
    await userEvent.hover(cell)

    const fullHash = screen.getByTestId('canto-full-hash')
    expect(fullHash).toBeInTheDocument()
    const hashGrid = screen.getByTestId('canto-hash-grid')
    expect(hashGrid).toBeInTheDocument()
    expect(hashGrid.children).toHaveLength(64)
  })

  it('hides full hash on mouse leave', async () => {
    const hash = 'ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234'
    render(<CantosScreen cantos={[hash]} />)

    const cell = screen.getByTestId('canto-cell-0')
    await userEvent.hover(cell)
    await userEvent.unhover(cell)

    expect(screen.queryByTestId('canto-full-hash')).not.toBeInTheDocument()
  })

  it('shows the count header without max', () => {
    render(<CantosScreen cantos={['A'.repeat(64), 'B'.repeat(64)]} />)

    expect(screen.getByText(/\(2\)/)).toBeInTheDocument()
  })

  it('filled cells are focusable', () => {
    render(<CantosScreen cantos={['A'.repeat(64)]} />)

    const filledCell = screen.getByTestId('canto-cell-0')
    expect(filledCell).toHaveAttribute('tabindex', '0')
  })

  it('uses Times New Roman font in cells', () => {
    render(<CantosScreen cantos={['A'.repeat(64)]} />)

    const cell = screen.getByTestId('canto-cell-0')
    expect(cell.style.fontFamily).toContain('Times New Roman')
  })
})
