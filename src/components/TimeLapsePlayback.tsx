import { useEffect, useState } from 'react'

import { GelBandView } from './GelBandView'

import { HEX_GRID_SIZE } from '@/engine/genetics'
import { identityForFrame } from '@/engine/timeLapse'
import { CameraSubject } from '@/engine/types'

import type { TimeLapseFrame } from '@/engine/types'

// Per-photograph reveal pacing — column-major cell reveal across the
// full 8x8 gel grid, matching ScanResultModal's cadence. The camera
// ceremony is silent: the gel-band SFX (/sfx/sequence.mp3) is the
// scan instrument's voice, not the camera's. A camera-specific SFX
// can be added later.
const HEADING_FADE_MS = 400
const CELL_REVEAL_MS = 40
const TOTAL_CELLS = HEX_GRID_SIZE * HEX_GRID_SIZE
const TOTAL_CELL_REVEAL_MS = CELL_REVEAL_MS * TOTAL_CELLS

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Subject heading copy. Falls through to the raw subject string when a
// future CameraSubject value isn't yet wired here — keeps the modal
// crash-free for forward-compatibility.
const subjectLabel = (subject: TimeLapseFrame['subject']): string => {
  switch (subject) {
    case CameraSubject.Pollination:
      return 'POLLINATION'
    case CameraSubject.Rain:
      return 'RAIN'
    case CameraSubject.Bloom:
      return 'BLOOM'
    case CameraSubject.Ember:
      return 'EMBER'
    case CameraSubject.MonarchVisit:
      return 'MONARCH'
    case CameraSubject.GhostPassage:
      return 'GHOST'
    case CameraSubject.EgregoreScan:
      return 'EGREGORE'
    case CameraSubject.CharacterApproach:
      return 'APPROACH'
    case CameraSubject.SeasonalLandmark:
      return 'SEASONAL LANDMARK'
    default:
      return (subject as string).toUpperCase()
  }
}

const formatTimestamp = (recordedAt: number): string => {
  const seconds = Math.floor(recordedAt / 1000)
  return `t = ${String(seconds)} s`
}

interface TimeLapsePlaybackProps {
  cameraUid: string
  frames: TimeLapseFrame[]
  onDismiss: () => void
}

export const TimeLapsePlayback = ({ cameraUid: _cameraUid, frames, onDismiss }: TimeLapsePlaybackProps) => {
  const reducedMotion = prefersReducedMotion()
  const [frameIndex, setFrameIndex] = useState(0)
  const [headingVisible, setHeadingVisible] = useState(reducedMotion)
  const [revealedCells, setRevealedCells] = useState(reducedMotion ? TOTAL_CELLS : 0)
  const [fullyRevealed, setFullyRevealed] = useState(reducedMotion)

  const frame = frames[frameIndex]
  const isLastFrame = frameIndex >= frames.length - 1

  useEffect(() => {
    if (reducedMotion) {
      setHeadingVisible(true)
      setRevealedCells(TOTAL_CELLS)
      setFullyRevealed(true)
      return
    }

    setHeadingVisible(false)
    setRevealedCells(0)
    setFullyRevealed(false)

    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(
      setTimeout(() => {
        setHeadingVisible(true)
      }, 50),
    )
    timers.push(
      setTimeout(() => {
        for (let i = 1; i <= TOTAL_CELLS; i++) {
          timers.push(
            setTimeout(() => {
              setRevealedCells(i)
            }, CELL_REVEAL_MS * i),
          )
        }
      }, HEADING_FADE_MS),
    )
    timers.push(
      setTimeout(() => {
        setFullyRevealed(true)
      }, HEADING_FADE_MS + TOTAL_CELL_REVEAL_MS),
    )

    return () => {
      timers.forEach(t => {
        clearTimeout(t)
      })
    }
  }, [frameIndex, reducedMotion])

  useEffect(() => {
    if (!fullyRevealed) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.key === 'Escape' || isLastFrame) {
        onDismiss()
        return
      }
      setFrameIndex(idx => idx + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [fullyRevealed, isLastFrame, onDismiss])

  if (!frame) return null

  const identity = identityForFrame(frame)

  return (
    <div
      data-testid="time-lapse-playback"
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center"
      onClick={() => {
        if (fullyRevealed && isLastFrame) onDismiss()
      }}
    >
      <div
        data-testid="time-lapse-content"
        className="film-grain-overlay border-border relative flex flex-col items-center gap-4 overflow-hidden border bg-black p-8 font-mono"
        onClick={e => {
          e.stopPropagation()
        }}
      >
        <div
          data-testid="time-lapse-heading"
          data-revealed={headingVisible}
          className="flex flex-col items-center gap-1 transition-opacity duration-[400ms]"
          style={{ opacity: headingVisible ? 1 : 0 }}
        >
          <h2 data-testid="time-lapse-subject" className="text-text text-2xl">
            {subjectLabel(frame.subject)}
          </h2>
          <p data-testid="time-lapse-timestamp" className="text-dim text-xs italic">
            {formatTimestamp(frame.recordedAt)}
          </p>
        </div>
        <div
          data-testid="time-lapse-photograph"
          data-revealed-cells={revealedCells}
          data-fully-revealed={fullyRevealed}
        >
          <GelBandView identity={identity} variant="flora" revealedCells={revealedCells} />
        </div>
        <p
          data-testid="time-lapse-hint"
          className="text-dim text-xs"
          style={{ opacity: fullyRevealed ? 0.7 : 0 }}
        >
          {isLastFrame
            ? 'Press any key to close'
            : `Press any key to advance (${String(frameIndex + 1)} / ${String(frames.length)})`}
        </p>
      </div>
    </div>
  )
}
