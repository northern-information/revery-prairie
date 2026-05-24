import { ScanResultModal } from '../ScanResultModal'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { playSfx } from '@/engine/audio'
import { FloraSpecies } from '@/engine/types'
import type { ScanCommitResult } from '@/engine/scan'

vi.mock('@/engine/audio', () => ({
  playSfx: vi.fn(),
}))

const playSfxMock = vi.mocked(playSfx)

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
    playSfxMock.mockClear()
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

  describe('sequence SFX', () => {
    it('fires playSfx once per cell-reveal tick across the animated reveal (64 total)', () => {
      render(<ScanResultModal result={floraResult} onDismiss={() => undefined} />)

      // Before the reveal scheduler fires, no SFX yet.
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(playSfxMock).not.toHaveBeenCalled()

      // Each cell tick fires one playSfx call.
      act(() => {
        vi.advanceTimersByTime(40 * 10)
      })
      expect(playSfxMock).toHaveBeenCalledTimes(10)
      expect(playSfxMock).toHaveBeenLastCalledWith('/sfx/sequence.mp3')

      act(() => {
        vi.advanceTimersByTime(40 * 54)
      })
      expect(playSfxMock).toHaveBeenCalledTimes(64)
    })

    it('fires playSfx exactly once on mount when prefers-reduced-motion is set', () => {
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
      render(<ScanResultModal result={floraResult} onDismiss={() => undefined} />)
      expect(playSfxMock).toHaveBeenCalledTimes(1)
      expect(playSfxMock).toHaveBeenCalledWith('/sfx/sequence.mp3')

      // Advancing time should not produce more calls — no per-cell scheduler ran.
      act(() => {
        vi.advanceTimersByTime(50 + 400 + 40 * 64)
      })
      expect(playSfxMock).toHaveBeenCalledTimes(1)
    })
  })

  // Regression — oaks are flora and must open the same ceremonial modal.
  // Doctrine: every scan kind shares this modal; no subject bypasses to
  // the manual or any other panel. PR #377 routed oak scans to the manual
  // instead; this test guards against that regression.
  describe('oak scan', () => {
    const oakResult: ScanCommitResult = {
      kind: 'oak',
      identity: 'b3a1c2d4e5f6071829304a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9',
    }

    it('renders White Oak above Quercus alba for kind oak', () => {
      render(<ScanResultModal result={oakResult} onDismiss={() => undefined} />)
      expect(screen.getByTestId('scan-result-common-name').textContent).toBe('White Oak')
      expect(screen.getByTestId('scan-result-binomial').textContent).toBe('Quercus alba')
    })

    it('uses the flora gel variant for oak (gold palette, not egregore purple)', () => {
      render(<ScanResultModal result={oakResult} onDismiss={() => undefined} />)
      expect(screen.getByTestId('scan-result-gel').getAttribute('data-variant')).toBe('flora')
    })

    it('runs the full reveal sequence the same as a flora scan', () => {
      render(<ScanResultModal result={oakResult} onDismiss={() => undefined} />)
      act(() => {
        vi.advanceTimersByTime(50 + 400 + 40 * 64)
      })
      expect(screen.getByTestId('scan-result-gel').getAttribute('data-fully-revealed')).toBe('true')
    })
  })

  // Egregore scans show an UNKNOWN heading in the Voynich typeface — the
  // cosmology name exists but is illegible. Replaces the prior doctrine
  // of suppressing the heading entirely for egregore.
  describe('egregore scan', () => {
    const egregoreResult: ScanCommitResult = {
      kind: 'egregore',
      identity: 'cafeb4be0f1a2b3c4d5e6f7081928374a5b6c7d8e9f0a1b2c3d4e5f607182931',
      position: { x: 12, y: 34 },
    }

    it('renders UNKNOWN above Unknown Unknown for kind egregore', () => {
      render(<ScanResultModal result={egregoreResult} onDismiss={() => undefined} />)
      expect(screen.getByTestId('scan-result-common-name').textContent).toBe('UNKNOWN')
      expect(screen.getByTestId('scan-result-binomial').textContent).toBe('Unknown Unknown')
    })

    it('applies the Voynich font to both heading lines for egregore', () => {
      render(<ScanResultModal result={egregoreResult} onDismiss={() => undefined} />)
      const commonName = screen.getByTestId('scan-result-common-name')
      const binomial = screen.getByTestId('scan-result-binomial')
      expect(commonName.style.fontFamily).toContain('Voynich')
      expect(binomial.style.fontFamily).toContain('Voynich')
    })

    it('uses the egregore gel variant', () => {
      render(<ScanResultModal result={egregoreResult} onDismiss={() => undefined} />)
      expect(screen.getByTestId('scan-result-gel').getAttribute('data-variant')).toBe('egregore')
    })

    it('does NOT apply the Voynich font to flora or oak headings', () => {
      const { rerender } = render(<ScanResultModal result={floraResult} onDismiss={() => undefined} />)
      expect(screen.getByTestId('scan-result-common-name').style.fontFamily).toBe('')
      expect(screen.getByTestId('scan-result-binomial').style.fontFamily).toBe('')

      const oakResult: ScanCommitResult = {
        kind: 'oak',
        identity: 'b3a1c2d4e5f6071829304a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9',
      }
      rerender(<ScanResultModal result={oakResult} onDismiss={() => undefined} />)
      expect(screen.getByTestId('scan-result-common-name').style.fontFamily).toBe('')
      expect(screen.getByTestId('scan-result-binomial').style.fontFamily).toBe('')
    })
  })
})
