import { useEffect, useState } from 'react'

import { GelBandView } from './GelBandView'

import type { ScannedSpecimen } from '@/engine/types'

interface SpecimenStackProps {
  specimens: ScannedSpecimen[]
  // Index to render when the stack first mounts (or when this id changes).
  // Useful for "open to the just-scanned card" — pass specimens.length - 1.
  initialIndex?: number
}

// Format a scan timestamp as a relative phrase. `scannedAt` and `now` are
// performance.now()-style milliseconds. Phrases stay terse:
//   < 5s → "just now"
//   < 60s → "N seconds ago"
//   < 60m → "N minutes ago"
//   else → "N hours ago"
const formatRelativeTime = (scannedAt: number, now: number): string => {
  const seconds = Math.max(0, Math.floor((now - scannedAt) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${String(seconds)} seconds ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${String(minutes)} minutes ago`
  const hours = Math.floor(minutes / 60)
  return hours === 1 ? '1 hour ago' : `${String(hours)} hours ago`
}

// RP-6 — renders a stack of scanned specimen cards with prev/next paging.
// Each card shows the 8x8 hex grid plus a relative scan time. The stack
// updates the displayed index when `initialIndex` changes (used to jump to
// the just-scanned card on manual auto-open).
export const SpecimenStack = ({ specimens, initialIndex }: SpecimenStackProps) => {
  const safeInitial = Math.max(0, Math.min((initialIndex ?? specimens.length - 1), specimens.length - 1))
  const [index, setIndex] = useState(safeInitial)
  const [now, setNow] = useState(performance.now())

  // Re-sync the displayed card when the initialIndex changes (a new scan
  // arrives, opens the stack to that card).
  useEffect(() => {
    setIndex(safeInitial)
  }, [safeInitial])

  // Tick the "now" clock once a second so relative times stay fresh while
  // the manual is open.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(performance.now())
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  if (specimens.length === 0) return null
  const current = specimens[index]
  const total = specimens.length

  const goPrev = () => {
    setIndex(i => (i - 1 + total) % total)
  }
  const goNext = () => {
    setIndex(i => (i + 1) % total)
  }

  return (
    <div data-testid="specimen-stack" className="my-2 inline-flex flex-col items-center gap-1">
      <div className="text-dim flex items-center gap-2 text-[10px]" data-testid="specimen-stack-header">
        <button
          type="button"
          onClick={goPrev}
          disabled={total <= 1}
          className="hover:text-text disabled:opacity-30"
          aria-label="Previous specimen"
        >
          {'<'}
        </button>
        <span data-testid="specimen-stack-counter">
          Specimen {String(index + 1)} of {String(total)}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={total <= 1}
          className="hover:text-text disabled:opacity-30"
          aria-label="Next specimen"
        >
          {'>'}
        </button>
      </div>
      <GelBandView identity={current.identity} />
      <div className="text-dim text-[10px]" data-testid="specimen-scan-time">
        Scanned {formatRelativeTime(current.scannedAt, now)}
      </div>
    </div>
  )
}
