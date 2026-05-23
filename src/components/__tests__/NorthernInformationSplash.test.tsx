import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { act, render, screen } from '@testing-library/react'

import { NorthernInformationSplash } from '../NorthernInformationSplash'

const FADE_OUT_START_MS = 2600
const SPLASH_TOTAL_MS = 3400

let mockTime = 0

const renderSplash = (overrides?: { onFadeOutStart?: () => void; onComplete?: () => void }) =>
  render(
    <NorthernInformationSplash
      onFadeOutStart={overrides?.onFadeOutStart ?? vi.fn()}
      onComplete={overrides?.onComplete ?? vi.fn()}
    />
  )

describe('Northern Information splash', () => {
  let nowSpy: MockInstance<() => number>

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    nowSpy = vi.spyOn(performance, 'now')
    mockTime = 0
    nowSpy.mockReturnValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders centered image with the colophon asset', () => {
    renderSplash()
    const img = screen.getByRole('img', { name: 'Northern Information' })
    expect(img).toHaveAttribute('src', '/applied-sciences-and-phantasms-working-division-flourescent.png')
    expect(img.className).toContain('object-contain')
  })

  it('mounts as a fixed full-viewport overlay above the underlying screen', () => {
    const { container } = renderSplash()
    const root = container.querySelector('[data-panel="northern-information-splash"]')
    expect(root).not.toBeNull()
    expect(root?.className).toContain('fixed')
    expect(root?.className).toContain('inset-0')
    expect(root?.className).toContain('z-50')
    expect(root?.className).toContain('bg-black')
  })

  it('carries the film-grain-overlay-strong utility on the root', () => {
    const { container } = renderSplash()
    const root = container.querySelector('[data-panel="northern-information-splash"]')
    expect(root?.className).toContain('film-grain-overlay-strong')
  })

  it('does not opt out of pointer events (clicks die at the backdrop, not pass through)', () => {
    const { container } = renderSplash()
    const root = container.querySelector('[data-panel="northern-information-splash"]')
    expect(root?.className).not.toContain('pointer-events-none')
  })

  it('starts at opacity 0 at mount', () => {
    const { container } = renderSplash()
    const root = container.querySelector<HTMLElement>('[data-panel="northern-information-splash"]')
    expect(root?.style.opacity).toBe('0')
  })

  it('invokes onFadeOutStart exactly once when the hold ends, before onComplete', () => {
    const onFadeOutStart = vi.fn()
    const onComplete = vi.fn()
    renderSplash({ onFadeOutStart, onComplete })
    expect(onFadeOutStart).not.toHaveBeenCalled()

    // Jump just past the fade-out threshold and flush one RAF tick.
    mockTime = FADE_OUT_START_MS + 1
    nowSpy.mockReturnValue(mockTime)
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(onFadeOutStart).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()

    // Further ticks during fade-out do not re-fire onFadeOutStart.
    mockTime = SPLASH_TOTAL_MS - 1
    nowSpy.mockReturnValue(mockTime)
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(onFadeOutStart).toHaveBeenCalledTimes(1)
  })

  it('invokes onComplete exactly once after total duration elapses', () => {
    const onComplete = vi.fn()
    renderSplash({ onComplete })
    expect(onComplete).not.toHaveBeenCalled()

    mockTime = SPLASH_TOTAL_MS + 1
    nowSpy.mockReturnValue(mockTime)
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)

    // Further RAF ticks do not re-fire onComplete (completedRef guard).
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('hides the image element when the asset fails to load', () => {
    renderSplash()
    const img = screen.getByRole('img', { name: 'Northern Information' })
    act(() => {
      img.dispatchEvent(new Event('error', { bubbles: true }))
    })
    expect(img.style.visibility).toBe('hidden')
  })
})
