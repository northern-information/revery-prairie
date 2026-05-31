import { useEffect, useState } from 'react'

import { Photograph } from './Photograph'
import type { PhotographDegradation } from './Photograph'
import { derivePredecessorDegradation } from '@/engine/predecessors/footage'
import type { PlacedCamera, TimeLapseFrame } from '@/engine/types'

// v11 R4 — playback is a contact sheet. Every frame in the queue
// renders in a CSS grid at once, chronological left-to-right,
// top-to-bottom (the same shape as a developed contact sheet from
// the lab the camera came out of). The contact sheet itself does not
// animate; clicking a frame opens an expanded single-frame view that
// supports arrow-key step + cross-fade. Escape from the expanded
// view returns to the sheet; a second Escape (or backdrop click)
// dismisses the whole modal.

// Contact-sheet thumbnail pitch — gives ~120px wide / ~60px tall
// iso-projected diamonds with the diamond geometry from
// src/engine/projection.ts (2 * charWidth wide, charHeight tall, 3x3
// viewport).
const SHEET_CELL_WIDTH = 14
const SHEET_CELL_HEIGHT = 28

// Expanded view pitch — roughly 4x the contact-sheet pitch.
const EXPANDED_CELL_WIDTH = 56
const EXPANDED_CELL_HEIGHT = 112

const CROSS_FADE_MS = 220

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const formatTimestamp = (recordedAt: number): string => {
  const seconds = Math.floor(recordedAt / 1000)
  return `t = ${String(seconds)} s`
}

interface TimeLapsePlaybackProps {
  cameraUid: string
  frames: TimeLapseFrame[]
  onDismiss: () => void
  // Optional: open directly into expanded view at this index. Used by
  // PhotographAlbumPanel rows, where clicking a row opens the
  // single-frame view for that one photograph.
  initialExpandedIndex?: number
  // RP-24 — when supplied with a predecessor record, the modal
  // renders a steward header and threads degradation through every
  // Photograph instance. When omitted (current-tenure cameras), the
  // modal falls back to the "Contact Sheet" header and renders frames
  // clean.
  placedCamera?: PlacedCamera
  // Genesis seed (nameToSeed(stewardName)). Required to derive the
  // per-predecessor degradation triple and the seedSalt for per-cell
  // glyphLeak rolls. Plumbed in from GameScreen.
  genesisSeed?: number
  // Index of this PlacedCamera within `state.placedCameras`. Used as
  // the per-predecessor key for degradation derivation.
  placedCameraIndex?: number
  // Current film count for the camera, used to decide the header's
  // gift|memorial label (gift = filmRemaining > 0; memorial = 0).
  // Threaded explicitly to avoid passing the whole GameState.
  filmRemaining?: number
}

export const TimeLapsePlayback = ({
  cameraUid: _cameraUid,
  frames,
  onDismiss,
  initialExpandedIndex,
  placedCamera,
  genesisSeed,
  placedCameraIndex,
  filmRemaining,
}: TimeLapsePlaybackProps) => {
  const reducedMotion = prefersReducedMotion()
  const initialIndex: number | null = initialExpandedIndex ?? null
  const [expandedIndex, setExpandedIndex] = useState(initialIndex)
  const [fadeKey, setFadeKey] = useState(0)

  // Cross-fade trigger: bumping `fadeKey` re-mounts the inner
  // photograph wrapper, which has a CSS opacity transition that runs
  // from 0 → 1 on mount.
  useEffect(() => {
    if (expandedIndex === null) return
    setFadeKey(k => k + 1)
  }, [expandedIndex])

  // Keyboard handling. The contact-sheet view consumes only Escape.
  // The expanded view consumes Escape (returns to sheet) and the
  // arrow keys (step). Arrow keys on the contact sheet are no-ops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (expandedIndex !== null) {
          setExpandedIndex(null)
          return
        }
        onDismiss()
        return
      }
      if (expandedIndex === null) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setExpandedIndex(idx => (idx === null || idx <= 0 ? idx : idx - 1))
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setExpandedIndex(idx => (idx === null || idx >= frames.length - 1 ? idx : idx + 1))
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [expandedIndex, frames.length, onDismiss])

  if (frames.length === 0) return null

  // RP-24 — resolve the predecessor header text + per-photograph
  // degradation. The header reads gift|memorial from the residual
  // film count (a gift predecessor's camera retains unused film,
  // unlike a memorial). For current-tenure cameras the header is
  // exactly "Contact Sheet" — preserving the RP-23 string verbatim.
  const predecessor = placedCamera?.predecessor
  const isPredecessor = predecessor !== undefined && genesisSeed !== undefined && placedCameraIndex !== undefined
  const degradation: PhotographDegradation | undefined = isPredecessor
    ? derivePredecessorDegradation(genesisSeed, placedCameraIndex, predecessor.tenure)
    : undefined
  // Memorial vs gift is decided at playback open time by the camera's
  // current film count. A gift can become a memorial mid-playback only
  // if film is consumed in the same session — acceptable for the
  // header which mounts once.
  const fateLabel: 'gift' | 'memorial' = isPredecessor && (filmRemaining ?? 0) > 0 ? 'gift' : 'memorial'
  const seedSalt = isPredecessor ? `${String(genesisSeed)}:${String(placedCameraIndex)}` : undefined
  const headerText = isPredecessor
    ? `Steward ${predecessor.stewardName} of Tenure ${String(predecessor.tenure)}, ${fateLabel}.`
    : 'Contact Sheet'

  return (
    <div
      data-testid="time-lapse-playback"
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/80"
      onClick={() => {
        // Backdrop click — same rules as Escape.
        if (expandedIndex !== null) {
          setExpandedIndex(null)
          return
        }
        onDismiss()
      }}
    >
      <div
        data-testid="time-lapse-sheet"
        className="border-border relative flex max-h-[85vh] max-w-[90vw] flex-col gap-4 overflow-y-auto border bg-black p-6 font-mono"
        onClick={e => {
          e.stopPropagation()
        }}
      >
        <h2 data-testid="time-lapse-playback-header" className="text-text text-sm uppercase tracking-widest">
          {headerText}
        </h2>
        <div
          data-testid="time-lapse-grid"
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
        >
          {frames.map((frame, i) => (
            <button
              key={`${String(frame.recordedAt)}-${String(i)}`}
              type="button"
              data-testid={`time-lapse-frame-${String(i)}`}
              className="hover:border-bee/60 flex flex-col items-center gap-1 border border-transparent p-1 text-left focus:outline-none"
              onClick={e => {
                e.stopPropagation()
                setExpandedIndex(i)
              }}
            >
              <Photograph
                cells={frame.cells}
                cellWidth={SHEET_CELL_WIDTH}
                cellHeight={SHEET_CELL_HEIGHT}
                degradation={degradation}
                seedSalt={seedSalt}
                frameIndex={i}
                testIdPrefix={`time-lapse-thumb-${String(i)}`}
              />
              <span className="text-dim text-[10px] italic">{formatTimestamp(frame.recordedAt)}</span>
            </button>
          ))}
        </div>
      </div>

      {expandedIndex !== null && frames[expandedIndex] && (
        <div
          data-testid="time-lapse-expanded"
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/90"
          onClick={() => {
            setExpandedIndex(null)
          }}
        >
          <div
            data-testid="time-lapse-expanded-content"
            className="border-border relative flex flex-col items-center gap-3 border bg-black p-6 font-mono"
            onClick={e => {
              e.stopPropagation()
            }}
          >
            <div
              key={fadeKey}
              data-testid="time-lapse-expanded-fade"
              style={{
                opacity: 1,
                animation: reducedMotion ? undefined : `time-lapse-fade-in ${String(CROSS_FADE_MS)}ms ease-out`,
              }}
            >
              <Photograph
                cells={frames[expandedIndex].cells}
                cellWidth={EXPANDED_CELL_WIDTH}
                cellHeight={EXPANDED_CELL_HEIGHT}
                degradation={degradation}
                seedSalt={seedSalt}
                frameIndex={expandedIndex}
                testIdPrefix="time-lapse-expanded-photo"
              />
            </div>
            <p data-testid="time-lapse-expanded-timestamp" className="text-dim text-xs italic">
              {formatTimestamp(frames[expandedIndex].recordedAt)} · {String(expandedIndex + 1)} / {String(frames.length)}
            </p>
            <p data-testid="time-lapse-expanded-hint" className="text-dim text-[10px]">
              ← → to step · Esc to close
            </p>
          </div>
          <style>{`@keyframes time-lapse-fade-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </div>
      )}
    </div>
  )
}
