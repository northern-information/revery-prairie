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
    // Rebate strips rendered in gold to match the gel bands.
    expect(left.className).toContain('text-bee')
    expect(right.className).toContain('text-bee')
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

  describe('egregore variant (RP-8a)', () => {
    it('marks the wrapper with data-variant="egregore"', () => {
      render(<GelBandView identity={identity} variant="egregore" />)
      const wrapper = screen.getByTestId('gel-band-view')
      expect(wrapper.getAttribute('data-variant')).toBe('egregore')
    })

    it('uses gold reticle + side labels with only the gel bands going violet', () => {
      render(<GelBandView identity={identity} variant="egregore" />)
      // Reticle borders and side labels stay on the gold/bee tokens —
      // the viewfinder chrome is consistent across variants. Only the
      // gel bands themselves carry the cosmology-specific violet.
      const left = screen.getByTestId('gel-side-label-left')
      const right = screen.getByTestId('gel-edge-code')
      expect(left.className).toContain('text-bee')
      expect(right.className).toContain('text-bee')
      expect(left.className).not.toContain('text-[#B080D0]')
      expect(right.className).not.toContain('text-[#B080D0]')
      // Corner crops are gold too.
      const crops = ['gel-crop-tl', 'gel-crop-tr', 'gel-crop-bl', 'gel-crop-br']
      for (const id of crops) {
        const el = screen.getByTestId(id)
        expect(el.className).toContain('border-bee')
        expect(el.className).not.toContain('border-[#B080D0]')
      }
      // Bands themselves are violet, never gold.
      const cell = screen.getByTestId('gel-band-cell-0-0')
      expect(cell.className).not.toContain('bg-bee')
      expect(cell.className).toContain('bg-[#B080D0]')
    })

    it('uses per-column hash-derived widths that vary across columns', () => {
      const { container } = render(<GelBandView identity={identity} variant="egregore" />)
      const innerGrid = container.querySelector('.grid')
      expect(innerGrid).toBeTruthy()
      const cols = (innerGrid as HTMLElement).style.gridTemplateColumns
      // gridTemplateColumns is now a list of 8 explicit px values
      // (instead of "repeat(8, 40px)").
      const widths = cols
        .split(' ')
        .filter(w => w.endsWith('px'))
        .map(w => parseFloat(w))
      expect(widths).toHaveLength(HEX_GRID_SIZE)
      const distinct = new Set(widths.map(w => Math.round(w * 10) / 10))
      // Per-column hash should produce at least 4 distinct widths over 8 columns
      // for a high-entropy SHA256 identity.
      expect(distinct.size).toBeGreaterThanOrEqual(4)
      // Sum should match TOTAL_SIZE (8 * 40 = 320), within float precision.
      const sum = widths.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(40 * HEX_GRID_SIZE, 1)
    })

    it('uses uniform column widths for the flora variant (no per-column jitter)', () => {
      const { container } = render(<GelBandView identity={identity} variant="flora" />)
      const innerGrid = container.querySelector('.grid')
      const cols = (innerGrid as HTMLElement).style.gridTemplateColumns
      // The flora variant uses "repeat(N, NNpx)" template.
      expect(cols).toContain('repeat(')
    })

    it('renders deterministically per identity for the egregore variant', () => {
      const first = render(<GelBandView identity={identity} variant="egregore" />)
      const firstHTML = first.container.innerHTML
      first.unmount()
      const second = render(<GelBandView identity={identity} variant="egregore" />)
      expect(second.container.innerHTML).toBe(firstHTML)
    })

    it('amplifies band jitter compared to the flora variant', () => {
      // Same identity, same cell, different variants — the egregore
      // variant should produce a wider horizontal offset range. We
      // sample across all 64 cells and compare the spread of marginLeft.
      const collectOffsets = (variant: 'flora' | 'egregore') => {
        const { container, unmount } = render(<GelBandView identity={identity} variant={variant} />)
        const offsets: number[] = []
        for (let r = 0; r < HEX_GRID_SIZE; r++) {
          for (let c = 0; c < HEX_GRID_SIZE; c++) {
            const cell = container.querySelector<HTMLElement>(`[data-testid="gel-band-cell-${String(r)}-${String(c)}"]`)
            if (cell) offsets.push(parseFloat(cell.style.marginLeft))
          }
        }
        unmount()
        return offsets
      }
      const floraOffsets = collectOffsets('flora')
      const egregoreOffsets = collectOffsets('egregore')
      const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
      expect(range(egregoreOffsets)).toBeGreaterThan(range(floraOffsets))
    })
  })
})
