import { useEffect, useRef, useState } from 'react'

import { SCAN_DURATION_MS } from '@/engine/constants'

import type { GameState } from '@/engine/types'

interface ScanProgressBarProps {
  state: GameState
}

// Precis #6 — DOM progress bar shown while [f] is held over a flora tile.
// Centered above the bottom bar with the label "Sequencing...". Animates
// via rAF while state.scanInProgress is non-null. The actual commit /
// abort logic lives in useKeyboard.ts; this component only displays
// progress.
export const ScanProgressBar = ({ state }: ScanProgressBarProps) => {
  const progress = state.scanInProgress
  const [, forceTick] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!progress) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }
    const tick = () => {
      forceTick(n => n + 1)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [progress])

  if (!progress) return null

  const elapsed = performance.now() - progress.startTime
  const t = Math.max(0, Math.min(1, elapsed / SCAN_DURATION_MS))
  const pct = Math.round(t * 100)

  return (
    <div
      data-panel="scan-progress-bar"
      data-testid="scan-progress-bar"
      className="pointer-events-none fixed bottom-52 left-1/2 z-20 flex w-64 -translate-x-1/2 flex-col gap-1 rounded border border-border bg-black/80 px-3 py-2 font-mono text-xs"
    >
      <div className="text-text">Sequencing...</div>
      <div className="border-border h-2 w-full overflow-hidden border bg-black/50">
        <div
          className="bg-pink h-full transition-[width] duration-75 ease-linear"
          style={{ width: `${String(pct)}%` }}
          data-testid="scan-progress-fill"
        />
      </div>
    </div>
  )
}
