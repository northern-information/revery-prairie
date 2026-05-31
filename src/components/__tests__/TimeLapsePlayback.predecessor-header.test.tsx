import { TimeLapsePlayback } from '../TimeLapsePlayback'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Zone } from '@/engine/types'
import type { PlacedCamera, PredecessorRecord, TimeLapseCell, TimeLapseFrame } from '@/engine/types'

const fakeCells = (seed: number): TimeLapseCell[] =>
  Array.from({ length: 9 }, (_, i) => ({ char: String.fromCharCode(97 + ((seed + i) % 26)), color: '#fff' }))

const makeFrames = (count: number): TimeLapseFrame[] =>
  Array.from({ length: count }, (_, i) => ({ recordedAt: i * 1000, cells: fakeCells(i) }))

const makePredecessorCamera = (predecessor: PredecessorRecord): PlacedCamera => ({
  uid: 'cam-pred',
  x: 5,
  y: 5,
  zone: Zone.Overworld,
  startedAt: 0,
  expiresAt: 0,
  frames: [],
  predecessor,
})

const makePlainCamera = (): PlacedCamera => ({
  uid: 'cam-plain',
  x: 5,
  y: 5,
  zone: Zone.Overworld,
  startedAt: 0,
  expiresAt: 0,
  frames: [],
})

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

describe('TimeLapsePlayback predecessor header (RP-24)', () => {
  beforeEach(() => {
    stubMatchMedia(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders "Contact Sheet" for a non-predecessor placedCamera', () => {
    const frames = makeFrames(3)
    render(
      <TimeLapsePlayback
        cameraUid="cam-plain"
        frames={frames}
        placedCamera={makePlainCamera()}
        genesisSeed={12345}
        placedCameraIndex={0}
        filmRemaining={0}
        onDismiss={() => undefined}
      />
    )
    expect(screen.getByTestId('time-lapse-playback-header').textContent).toBe('Contact Sheet')
  })

  it('renders "Contact Sheet" when placedCamera is omitted entirely', () => {
    const frames = makeFrames(3)
    render(<TimeLapsePlayback cameraUid="cam-1" frames={frames} onDismiss={() => undefined} />)
    expect(screen.getByTestId('time-lapse-playback-header').textContent).toBe('Contact Sheet')
  })

  it('renders the predecessor header with gift label when filmRemaining > 0', () => {
    const predecessor: PredecessorRecord = { stewardName: 'Aria', tenure: 7, fate: 'bed' }
    const frames = makeFrames(3)
    render(
      <TimeLapsePlayback
        cameraUid="cam-pred"
        frames={frames}
        placedCamera={makePredecessorCamera(predecessor)}
        genesisSeed={42}
        placedCameraIndex={1}
        filmRemaining={11}
        onDismiss={() => undefined}
      />
    )
    expect(screen.getByTestId('time-lapse-playback-header').textContent).toBe('Steward Aria of Tenure 7, gift.')
  })

  it('renders the predecessor header with memorial label when filmRemaining === 0', () => {
    const predecessor: PredecessorRecord = { stewardName: 'Bryn', tenure: 3, fate: 'bed' }
    const frames = makeFrames(3)
    render(
      <TimeLapsePlayback
        cameraUid="cam-pred"
        frames={frames}
        placedCamera={makePredecessorCamera(predecessor)}
        genesisSeed={42}
        placedCameraIndex={0}
        filmRemaining={0}
        onDismiss={() => undefined}
      />
    )
    expect(screen.getByTestId('time-lapse-playback-header').textContent).toBe('Steward Bryn of Tenure 3, memorial.')
  })

  it('threads degradation through every contact-sheet thumbnail Photograph', () => {
    const predecessor: PredecessorRecord = { stewardName: 'Caleth', tenure: 5, fate: 'bed' }
    const frames = makeFrames(4)
    const { container } = render(
      <TimeLapsePlayback
        cameraUid="cam-pred"
        frames={frames}
        placedCamera={makePredecessorCamera(predecessor)}
        genesisSeed={42}
        placedCameraIndex={2}
        filmRemaining={0}
        onDismiss={() => undefined}
      />
    )
    // Each thumbnail Photograph mounts the tint overlay div when
    // degradation is supplied; without degradation that div is absent.
    // We assert by counting tint overlays — one per frame.
    const tintOverlays = container.querySelectorAll('.film-grain-overlay > [aria-hidden="true"]')
    expect(tintOverlays.length).toBe(frames.length)
  })

  it('threads degradation into the expanded view as well', () => {
    const predecessor: PredecessorRecord = { stewardName: 'Daven', tenure: 2, fate: 'bed' }
    const frames = makeFrames(2)
    render(
      <TimeLapsePlayback
        cameraUid="cam-pred"
        frames={frames}
        placedCamera={makePredecessorCamera(predecessor)}
        genesisSeed={42}
        placedCameraIndex={3}
        filmRemaining={0}
        onDismiss={() => undefined}
      />
    )
    // Click into the expanded view; assert the expanded photo wrapper
    // mounted with the tint overlay.
    fireEvent.click(screen.getByTestId('time-lapse-frame-0'))
    const expanded = screen.getByTestId('time-lapse-expanded-photo')
    expect(expanded.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('omits degradation for current-tenure cameras (no tint overlay on thumbnails)', () => {
    const frames = makeFrames(3)
    const { container } = render(
      <TimeLapsePlayback
        cameraUid="cam-plain"
        frames={frames}
        placedCamera={makePlainCamera()}
        genesisSeed={42}
        placedCameraIndex={0}
        filmRemaining={0}
        onDismiss={() => undefined}
      />
    )
    const tintOverlays = container.querySelectorAll('.film-grain-overlay > [aria-hidden="true"]')
    expect(tintOverlays.length).toBe(0)
  })

  it('applies degradation even under prefers-reduced-motion', () => {
    stubMatchMedia(true)
    const predecessor: PredecessorRecord = { stewardName: 'Eira', tenure: 1, fate: 'bed' }
    const frames = makeFrames(2)
    const { container } = render(
      <TimeLapsePlayback
        cameraUid="cam-pred"
        frames={frames}
        placedCamera={makePredecessorCamera(predecessor)}
        genesisSeed={42}
        placedCameraIndex={0}
        filmRemaining={0}
        onDismiss={() => undefined}
      />
    )
    const tintOverlays = container.querySelectorAll('.film-grain-overlay > [aria-hidden="true"]')
    expect(tintOverlays.length).toBe(frames.length)
  })
})
