import { TimeLapsePlayback } from '../TimeLapsePlayback'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TimeLapseCell, TimeLapseFrame } from '@/engine/types'

const fakeCells = (seed: number): TimeLapseCell[] =>
  Array.from({ length: 9 }, (_, i) => ({ char: String.fromCharCode(97 + ((seed + i) % 26)), color: '#fff' }))

const makeFrames = (count: number): TimeLapseFrame[] =>
  Array.from({ length: count }, (_, i) => ({ recordedAt: i * 1000, cells: fakeCells(i) }))

const stubMatchMedia = (reducedMotion: boolean): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reducedMotion : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('TimeLapsePlayback', () => {
  beforeEach(() => {
    stubMatchMedia(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the contact sheet with one tile per frame', () => {
    const frames = makeFrames(5)
    render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={() => undefined} />)

    expect(screen.getByTestId('time-lapse-grid')).toBeTruthy()
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`time-lapse-frame-${String(i)}`)).toBeTruthy()
    }
  })

  it('does NOT render a GelBandView inside the playback modal', () => {
    const frames = makeFrames(3)
    const { container } = render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={() => undefined} />)

    // GelBandView renders a wrapper with data-testid="gel-band-view". The
    // contact-sheet redesign retires it from the playback path.
    expect(container.querySelector('[data-testid="gel-band-view"]')).toBeNull()
  })

  it('clicking a frame opens the expanded single-frame view at that index', () => {
    const frames = makeFrames(4)
    render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={() => undefined} />)

    expect(screen.queryByTestId('time-lapse-expanded')).toBeNull()
    fireEvent.click(screen.getByTestId('time-lapse-frame-2'))

    expect(screen.getByTestId('time-lapse-expanded')).toBeTruthy()
    expect(screen.getByTestId('time-lapse-expanded-timestamp').textContent).toContain('3 / 4')
  })

  it('ArrowRight steps the expanded index forward; ArrowLeft steps back', () => {
    const frames = makeFrames(4)
    render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={() => undefined} />)

    fireEvent.click(screen.getByTestId('time-lapse-frame-1'))
    expect(screen.getByTestId('time-lapse-expanded-timestamp').textContent).toContain('2 / 4')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('time-lapse-expanded-timestamp').textContent).toContain('3 / 4')

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('time-lapse-expanded-timestamp').textContent).toContain('1 / 4')
  })

  it('arrow keys are no-ops at the queue boundaries', () => {
    const frames = makeFrames(3)
    render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={() => undefined} />)

    fireEvent.click(screen.getByTestId('time-lapse-frame-0'))
    expect(screen.getByTestId('time-lapse-expanded-timestamp').textContent).toContain('1 / 3')

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('time-lapse-expanded-timestamp').textContent).toContain('1 / 3')

    // Advance to the last frame.
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('time-lapse-expanded-timestamp').textContent).toContain('3 / 3')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('time-lapse-expanded-timestamp').textContent).toContain('3 / 3')
  })

  it('arrow keys on the contact sheet (no expanded view) are no-ops', () => {
    const frames = makeFrames(3)
    const onDismiss = vi.fn()
    render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={onDismiss} />)

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.queryByTestId('time-lapse-expanded')).toBeNull()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('Escape from the expanded view returns to the contact sheet', () => {
    const frames = makeFrames(3)
    const onDismiss = vi.fn()
    render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByTestId('time-lapse-frame-1'))
    expect(screen.getByTestId('time-lapse-expanded')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('time-lapse-expanded')).toBeNull()
    expect(screen.getByTestId('time-lapse-grid')).toBeTruthy()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('a second Escape from the contact sheet dismisses the modal', () => {
    const frames = makeFrames(3)
    const onDismiss = vi.fn()
    render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={onDismiss} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when frames is empty', () => {
    const { container } = render(<TimeLapsePlayback cameraUid="cam-1" frames={[]} onDismiss={() => undefined} />)
    expect(container.querySelector('[data-testid="time-lapse-playback"]')).toBeNull()
  })

  it('the contact-sheet body is a scroll container (overflow-y auto) for long rolls', () => {
    const frames = makeFrames(50)
    render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={() => undefined} />)
    const sheet = screen.getByTestId('time-lapse-sheet')
    // Class-based assertion mirrors the Tailwind utility applied in the
    // component; jsdom does not compute styles, so we read the class.
    expect(sheet.className).toContain('overflow-y-auto')
    expect(screen.getByTestId('time-lapse-frame-49')).toBeTruthy()
  })

  it('prefers-reduced-motion: reduce skips the cross-fade animation', () => {
    stubMatchMedia(true)
    const frames = makeFrames(3)
    render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={() => undefined} />)

    fireEvent.click(screen.getByTestId('time-lapse-frame-1'))
    const fade = screen.getByTestId('time-lapse-expanded-fade')
    // The animation style is gated on !reducedMotion; under reduced
    // motion the inline animation property is undefined.
    expect(fade.style.animation === '' || fade.style.animation === undefined).toBe(true)
  })

  it('initialExpandedIndex opens directly into the expanded view at that index', () => {
    const frames = makeFrames(3)
    render(
      <TimeLapsePlayback cameraUid="cam-1" frames={frames} initialExpandedIndex={2} onDismiss={() => undefined} />
    )
    expect(screen.getByTestId('time-lapse-expanded')).toBeTruthy()
    expect(screen.getByTestId('time-lapse-expanded-timestamp').textContent).toContain('3 / 3')
  })
})
