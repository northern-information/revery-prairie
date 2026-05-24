import { NorthernInformationSplash } from '../NorthernInformationSplash'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MockInstance } from 'vitest'

// The audio module registers a document-level first-gesture primer
// that constructs an AudioContext when triggered. Stub it so the test
// keydown does not throw inside jsdom.
class MockAudioContext {
  state = 'running'
  destination = {}
  createGain = () => ({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() })
  createBufferSource = () => ({
    buffer: null,
    loop: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })
  decodeAudioData = (buf: ArrayBuffer) => Promise.resolve(buf as unknown as AudioBuffer)
  resume = () => Promise.resolve()
  close = () => Promise.resolve()
}
vi.stubGlobal('AudioContext', MockAudioContext)

const FADE_OUT_START_MS = 4400
const SPLASH_TOTAL_MS = 6000

let mockTime = 0

interface RenderOverrides {
  onFadeOutStart?: () => void
  onComplete?: () => void
  playAudio?: (url: string) => void
  stopAudio?: (fadeMs?: number) => void
}

const renderSplash = (overrides?: RenderOverrides) =>
  render(
    <NorthernInformationSplash
      onFadeOutStart={overrides?.onFadeOutStart ?? vi.fn()}
      onComplete={overrides?.onComplete ?? vi.fn()}
      playAudio={overrides?.playAudio ?? vi.fn()}
      stopAudio={overrides?.stopAudio ?? vi.fn()}
    />
  )

const firstGesture = (): void => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown'))
  })
}

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

  describe('pre-gesture state', () => {
    it('mounts in a static pre-gesture state with the hint label and no <img>', () => {
      const { container } = renderSplash()
      const root = container.querySelector('[data-panel="northern-information-splash"]')
      expect(root).not.toBeNull()
      expect(root?.getAttribute('data-state')).toBe('pre-gesture')
      expect(screen.getByText('Click To Begin')).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: 'Northern Information' })).toBeNull()
    })

    it('renders the pre-gesture surface at opacity 1 (static, not tweening)', () => {
      const { container } = renderSplash()
      const root = container.querySelector<HTMLElement>('[data-panel="northern-information-splash"]')
      expect(root?.style.opacity).toBe('1')
    })

    it('mounts as a fixed full-viewport overlay above the underlying screen', () => {
      const { container } = renderSplash()
      const root = container.querySelector('[data-panel="northern-information-splash"]')
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

    it('does not auto-advance from pre-gesture without a user gesture', () => {
      const onFadeOutStart = vi.fn()
      const onComplete = vi.fn()
      renderSplash({ onFadeOutStart, onComplete })

      mockTime = SPLASH_TOTAL_MS + 1000
      nowSpy.mockReturnValue(mockTime)
      act(() => {
        vi.advanceTimersByTime(50)
      })

      expect(onFadeOutStart).not.toHaveBeenCalled()
      expect(onComplete).not.toHaveBeenCalled()
    })

    it('does not invoke playAudio before any user gesture', () => {
      const playAudio = vi.fn()
      renderSplash({ playAudio })
      expect(playAudio).not.toHaveBeenCalled()
    })
  })

  describe('first gesture starts the splash', () => {
    it('first keydown transitions to running state and starts audio', () => {
      const playAudio = vi.fn()
      const { container } = renderSplash({ playAudio })

      firstGesture()

      const root = container.querySelector('[data-panel="northern-information-splash"]')
      expect(root?.getAttribute('data-state')).toBe('running')
      expect(playAudio).toHaveBeenCalledTimes(1)
      expect(playAudio).toHaveBeenCalledWith('/sfx/northern-information.mp3')
    })

    it('first gesture mounts the colophon <img>', () => {
      renderSplash()
      firstGesture()
      const img = screen.getByRole('img', { name: 'Northern Information' })
      expect(img).toHaveAttribute('src', '/applied-sciences-and-phantasms-working-division-flourescent.png')
      expect(img.className).toContain('object-contain')
    })

    it('first gesture does NOT invoke onFadeOutStart or onComplete', () => {
      const onFadeOutStart = vi.fn()
      const onComplete = vi.fn()
      renderSplash({ onFadeOutStart, onComplete })

      firstGesture()

      expect(onFadeOutStart).not.toHaveBeenCalled()
      expect(onComplete).not.toHaveBeenCalled()
    })

    it('click on the pre-gesture backdrop also starts the splash + audio', () => {
      const playAudio = vi.fn()
      const { container } = renderSplash({ playAudio })

      const root = container.querySelector('[data-panel="northern-information-splash"]')
      act(() => {
        if (root) fireEvent.click(root)
      })

      expect(playAudio).toHaveBeenCalledTimes(1)
      const after = container.querySelector('[data-panel="northern-information-splash"]')
      expect(after?.getAttribute('data-state')).toBe('running')
    })
  })

  describe('running state triangle wave', () => {
    it('invokes onFadeOutStart exactly once when the hold ends, before onComplete', () => {
      const onFadeOutStart = vi.fn()
      const onComplete = vi.fn()
      renderSplash({ onFadeOutStart, onComplete })

      firstGesture()
      expect(onFadeOutStart).not.toHaveBeenCalled()

      mockTime = FADE_OUT_START_MS + 1
      nowSpy.mockReturnValue(mockTime)
      act(() => {
        vi.advanceTimersByTime(20)
      })
      expect(onFadeOutStart).toHaveBeenCalledTimes(1)
      expect(onComplete).not.toHaveBeenCalled()

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
      firstGesture()
      expect(onComplete).not.toHaveBeenCalled()

      mockTime = SPLASH_TOTAL_MS + 1
      nowSpy.mockReturnValue(mockTime)
      act(() => {
        vi.advanceTimersByTime(20)
      })
      expect(onComplete).toHaveBeenCalledTimes(1)

      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('hides the image element when the asset fails to load', () => {
      renderSplash()
      firstGesture()
      const img = screen.getByRole('img', { name: 'Northern Information' })
      act(() => {
        img.dispatchEvent(new Event('error', { bubbles: true }))
      })
      expect(img.style.visibility).toBe('hidden')
    })
  })

  describe('skip during running state', () => {
    it('second gesture skips the running splash and calls stopAudio(300)', () => {
      const onFadeOutStart = vi.fn()
      const stopAudio = vi.fn()
      renderSplash({ onFadeOutStart, stopAudio })

      firstGesture()
      expect(onFadeOutStart).not.toHaveBeenCalled()
      expect(stopAudio).not.toHaveBeenCalled()

      mockTime = 200
      nowSpy.mockReturnValue(mockTime)
      firstGesture()

      expect(onFadeOutStart).toHaveBeenCalledTimes(1)
      expect(stopAudio).toHaveBeenCalledTimes(1)
      expect(stopAudio).toHaveBeenCalledWith(300)
    })

    it('subsequent skip gestures are idempotent (no-op after first)', () => {
      const onFadeOutStart = vi.fn()
      const stopAudio = vi.fn()
      renderSplash({ onFadeOutStart, stopAudio })

      firstGesture()
      mockTime = 200
      nowSpy.mockReturnValue(mockTime)
      firstGesture()
      firstGesture()
      firstGesture()

      expect(onFadeOutStart).toHaveBeenCalledTimes(1)
      expect(stopAudio).toHaveBeenCalledTimes(1)
    })
  })

  describe('unmount cleanup', () => {
    it('calls stopAudio on unmount even when splash never started', () => {
      const stopAudio = vi.fn()
      const { unmount } = renderSplash({ stopAudio })

      unmount()

      expect(stopAudio).toHaveBeenCalledWith(0)
    })

    it('calls stopAudio on unmount mid-running to kill in-flight audio', () => {
      const stopAudio = vi.fn()
      const { unmount } = renderSplash({ stopAudio })
      firstGesture()
      mockTime = 1000
      nowSpy.mockReturnValue(mockTime)

      unmount()

      expect(stopAudio).toHaveBeenCalledWith(0)
    })
  })
})
