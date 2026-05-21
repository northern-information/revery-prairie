import { ScanResultModal } from '../ScanResultModal'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScanCommitResult } from '@/engine/scan'
import { FloraSpecies } from '@/engine/types'

const identity = '0e7d7b052690f720498415c0d9c0d36861af3edc5e6d872c2490f2b4a5b8d725'
const floraResult: ScanCommitResult = {
  kind: 'flora',
  species: FloraSpecies.Clover,
  identity,
  position: { x: 0, y: 0 },
}

describe('scan-result modal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders the common name above the latin binomial', () => {
    render(<ScanResultModal result={floraResult} onDismiss={() => undefined} />)
    expect(screen.getByTestId('scan-result-common-name').textContent).toBe('Clover')
    expect(screen.getByTestId('scan-result-binomial').textContent).toBe('Trifolium repens')
  })

  it('starts with no cells revealed and binomial hidden', () => {
    render(<ScanResultModal result={floraResult} onDismiss={() => undefined} />)
    const gel = screen.getByTestId('scan-result-gel')
    expect(gel.getAttribute('data-revealed-cells')).toBe('0')
    expect(gel.getAttribute('data-fully-revealed')).toBe('false')
  })

  it('reveals cells one at a time in column-major order, then marks fully revealed', () => {
    render(<ScanResultModal result={floraResult} onDismiss={() => undefined} />)

    // Advance to just past the binomial fade (400ms) so the cell-reveal
    // scheduler has fired but no cell ticks have yet.
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.getByTestId('scan-result-heading').getAttribute('data-revealed')).toBe('true')
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-revealed-cells')).toBe('0')

    // Advance 10 cell-reveal ticks (10 * 40ms). 10 cells revealed.
    act(() => {
      vi.advanceTimersByTime(40 * 10)
    })
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-revealed-cells')).toBe('10')
    // Column-major order: column 0 (cells 0-7) → column 1 (cells 8-15).
    // After 10 cells, col 0 fully revealed and col 1 has 2 cells revealed.
    expect(screen.getByTestId('gel-band-cell-0-0').getAttribute('data-revealed')).toBe('true')
    expect(screen.getByTestId('gel-band-cell-7-0').getAttribute('data-revealed')).toBe('true')
    expect(screen.getByTestId('gel-band-cell-1-1').getAttribute('data-revealed')).toBe('true')
    // Cells later in column-major order are still hidden.
    expect(screen.getByTestId('gel-band-cell-0-2').getAttribute('data-revealed')).toBe('false')

    // Advance through the rest of the reveal (54 more cells).
    act(() => {
      vi.advanceTimersByTime(40 * 54)
    })
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-revealed-cells')).toBe('64')
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-fully-revealed')).toBe('true')
  })

  it('ignores key dismiss before fully revealed', () => {
    const onDismiss = vi.fn()
    render(<ScanResultModal result={floraResult} onDismiss={onDismiss} />)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses on key after fully revealed', () => {
    const onDismiss = vi.fn()
    render(<ScanResultModal result={floraResult} onDismiss={onDismiss} />)
    act(() => {
      vi.advanceTimersByTime(50 + 400 + 40 * 64)
    })
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-fully-revealed')).toBe('true')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders the GelBandView with the provided identity', () => {
    render(<ScanResultModal result={floraResult} onDismiss={() => undefined} />)
    expect(screen.getByTestId('gel-band-view')).toBeInTheDocument()
  })

  it('with prefers-reduced-motion: renders instantly and is dismissable immediately', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const onDismiss = vi.fn()
    render(<ScanResultModal result={floraResult} onDismiss={onDismiss} />)
    expect(screen.getByTestId('scan-result-heading').getAttribute('data-revealed')).toBe('true')
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-fully-revealed')).toBe('true')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
