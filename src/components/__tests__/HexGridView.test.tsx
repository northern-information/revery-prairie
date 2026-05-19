import { HexGridView } from '../HexGridView'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HEX_GRID_SIZE, hashToHexGrid } from '@/engine/genetics'

describe('HexGridView', () => {
  const identity = '0e7d7b052690f720498415c0d9c0d36861af3edc5e6d872c2490f2b4a5b8d725'

  it('renders 64 cells for an 8x8 grid', () => {
    render(<HexGridView identity={identity} />)
    const container = screen.getByTestId('hex-grid-view')
    // Each cell is a span. 64 spans total.
    const cells = within(container).getAllByText(/^[0-9a-f]$/)
    expect(cells).toHaveLength(HEX_GRID_SIZE * HEX_GRID_SIZE)
  })

  it('cell values match the hashToHexGrid mapping', () => {
    const grid = hashToHexGrid(identity)
    render(<HexGridView identity={identity} />)
    const container = screen.getByTestId('hex-grid-view')
    const cells = within(container).getAllByText(/^[0-9a-f]$/)
    // Cells render in row-major order.
    const expected = grid.flat().map(n => n.toString(16))
    const actual = cells.map(c => c.textContent ?? '')
    expect(actual).toEqual(expected)
  })

  it('renders deterministically for the same identity', () => {
    const first = render(<HexGridView identity={identity} />)
    const firstText = first.container.textContent
    first.unmount()
    const second = render(<HexGridView identity={identity} />)
    expect(second.container.textContent).toBe(firstText)
  })

  it('renders different content for different identities', () => {
    const a = render(<HexGridView identity={'a'.repeat(64)} />)
    const aText = a.container.textContent
    a.unmount()
    const b = render(<HexGridView identity={'b'.repeat(64)} />)
    expect(b.container.textContent).not.toBe(aText)
  })
})
