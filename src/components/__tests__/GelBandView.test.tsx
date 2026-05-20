import { GelBandView } from '../GelBandView'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { hashToHexGrid, HEX_GRID_SIZE } from '@/engine/genetics'

describe('GelBandView', () => {
  const identity = '0e7d7b052690f720498415c0d9c0d36861af3edc5e6d872c2490f2b4a5b8d725'

  it('renders 64 band cells for an 8x8 grid', () => {
    render(<GelBandView identity={identity} />)
    const container = screen.getByTestId('gel-band-view')
    const cells = within(container).getAllByTestId(/^gel-band-cell-/)
    expect(cells).toHaveLength(HEX_GRID_SIZE * HEX_GRID_SIZE)
  })

  it('cell opacity matches nibble / 15', () => {
    const grid = hashToHexGrid(identity)
    render(<GelBandView identity={identity} />)
    for (let r = 0; r < HEX_GRID_SIZE; r++) {
      for (let c = 0; c < HEX_GRID_SIZE; c++) {
        const cell = screen.getByTestId(`gel-band-cell-${String(r)}-${String(c)}`)
        const expected = grid[r][c] / 15
        const actual = parseFloat(cell.style.opacity)
        expect(actual).toBeCloseTo(expected, 5)
      }
    }
  })

  it('renders deterministically for the same identity', () => {
    const first = render(<GelBandView identity={identity} />)
    const firstHTML = first.container.innerHTML
    first.unmount()
    const second = render(<GelBandView identity={identity} />)
    expect(second.container.innerHTML).toBe(firstHTML)
  })

  it('renders different content for different identities', () => {
    const a = render(<GelBandView identity={'a'.repeat(64)} />)
    const aHTML = a.container.innerHTML
    a.unmount()
    const b = render(<GelBandView identity={'b'.repeat(64)} />)
    expect(b.container.innerHTML).not.toBe(aHTML)
  })

  it('renders an asymmetric vertical rebate — label on the left, edge code on the right', () => {
    render(<GelBandView identity={identity} />)
    const left = screen.getByTestId('gel-side-label-left')
    const right = screen.getByTestId('gel-edge-code')
    expect(left.textContent).toContain('NORTHERN-INFORMATION')
    expect(left.textContent).toContain(identity.slice(0, 8))
    expect(right.textContent).toContain(identity.slice(0, 8))
    // Right side carries the arrow-flanked identity code (two pointer glyphs).
    expect((right.textContent?.match(/[→»▸▶◀◂]/g) ?? []).length).toBeGreaterThanOrEqual(2)
    // Rebate strips rendered in dim gray — only the gel bands themselves are gold.
    expect(left.className).toContain('text-dim')
    expect(right.className).toContain('text-dim')
    // No mirrored right-side label or horizontal arrow strip — they're replaced by the vertical edge code.
    expect(screen.queryByTestId('gel-side-label-right')).toBeNull()
  })

  it('renders four corner crop marks framing the gel', () => {
    render(<GelBandView identity={identity} />)
    expect(screen.getByTestId('gel-crop-tl')).toBeTruthy()
    expect(screen.getByTestId('gel-crop-tr')).toBeTruthy()
    expect(screen.getByTestId('gel-crop-bl')).toBeTruthy()
    expect(screen.getByTestId('gel-crop-br')).toBeTruthy()
  })
})
