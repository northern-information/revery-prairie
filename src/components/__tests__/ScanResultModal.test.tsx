import { ScanResultModal } from '../ScanResultModal'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FloraSpecies } from '@/engine/types'

const identity = '0e7d7b052690f720498415c0d9c0d36861af3edc5e6d872c2490f2b4a5b8d725'

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

  it('renders the latin binomial heading', () => {
    render(<ScanResultModal species={FloraSpecies.Clover} identity={identity} onDismiss={() => undefined} />)
    expect(screen.getByTestId('scan-result-binomial').textContent).toBe('Trifolium repens')
  })

  it('starts with no rows revealed and binomial hidden', () => {
    render(<ScanResultModal species={FloraSpecies.Clover} identity={identity} onDismiss={() => undefined} />)
    const gel = screen.getByTestId('scan-result-gel')
    expect(gel.getAttribute('data-revealed-rows')).toBe('0')
    expect(gel.getAttribute('data-fully-revealed')).toBe('false')
  })

  it('reveals rows top-to-bottom over time, then marks fully revealed', () => {
    render(<ScanResultModal species={FloraSpecies.Clover} identity={identity} onDismiss={() => undefined} />)

    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(screen.getByTestId('scan-result-binomial').getAttribute('data-revealed')).toBe('true')

    // After binomial fade (400ms) + 4 row-reveal ticks (4 * 80ms), 4 rows revealed.
    act(() => {
      vi.advanceTimersByTime(400 + 80 * 4)
    })
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-revealed-rows')).toBe('4')

    // Advance through the rest of the reveal.
    act(() => {
      vi.advanceTimersByTime(80 * 4)
    })
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-revealed-rows')).toBe('8')
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-fully-revealed')).toBe('true')
  })

  it('ignores key dismiss before fully revealed', () => {
    const onDismiss = vi.fn()
    render(<ScanResultModal species={FloraSpecies.Clover} identity={identity} onDismiss={onDismiss} />)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses on key after fully revealed', () => {
    const onDismiss = vi.fn()
    render(<ScanResultModal species={FloraSpecies.Clover} identity={identity} onDismiss={onDismiss} />)
    act(() => {
      vi.advanceTimersByTime(50 + 400 + 80 * 8)
    })
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-fully-revealed')).toBe('true')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders the GelBandView with the provided identity', () => {
    render(<ScanResultModal species={FloraSpecies.Clover} identity={identity} onDismiss={() => undefined} />)
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
    render(<ScanResultModal species={FloraSpecies.Clover} identity={identity} onDismiss={onDismiss} />)
    expect(screen.getByTestId('scan-result-binomial').getAttribute('data-revealed')).toBe('true')
    expect(screen.getByTestId('scan-result-gel').getAttribute('data-fully-revealed')).toBe('true')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
