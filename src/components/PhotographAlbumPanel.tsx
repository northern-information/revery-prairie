import { useState } from 'react'
import { TimeLapsePlayback } from './TimeLapsePlayback'

import { identityForFrame } from '@/engine/timeLapse'
import { CameraSubject } from '@/engine/types'
import type { GameState, TimeLapseFrame } from '@/engine/types'

interface PhotographAlbumPanelProps {
  state: GameState
}

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
      return String(subject).toUpperCase()
  }
}

const formatTimestamp = (recordedAt: number): string => {
  const seconds = Math.floor(recordedAt / 1000)
  return `t = ${String(seconds)} s`
}

export const PhotographAlbumPanel = ({ state }: PhotographAlbumPanelProps) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  // Most-recent first per the spec's chronological listing — newest
  // photograph at the top, oldest at the bottom. We render in reverse
  // index order without mutating the underlying array.
  const entries = state.photographAlbum
  const order = entries.map((_, i) => i).reverse()

  if (entries.length === 0) {
    return (
      <div className="text-dim p-4 font-mono text-sm italic">
        No photographs yet. Deploy a Field Camera in the field.
      </div>
    )
  }

  return (
    <div className="overflow-auto p-3 font-mono">
      <ul className="flex flex-col gap-1">
        {order.map(i => {
          const frame = entries[i]
          const edgeCode = identityForFrame(frame).slice(0, 8)
          return (
            <li key={i}>
              <button
                data-testid={`album-row-${String(i)}`}
                type="button"
                onClick={() => {
                  setActiveIndex(i)
                }}
                className="text-text hover:bg-bee/10 hover:border-bee/40 flex w-full items-center justify-between rounded border border-transparent p-2 text-left"
              >
                <span className="text-text text-sm">{subjectLabel(frame.subject)}</span>
                <span className="text-dim text-xs italic">
                  {edgeCode} · {formatTimestamp(frame.recordedAt)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {activeIndex !== null && (
        <TimeLapsePlayback
          cameraUid={`album-${String(activeIndex)}`}
          frames={[entries[activeIndex]]}
          onDismiss={() => {
            setActiveIndex(null)
          }}
        />
      )}
    </div>
  )
}
