import { useEffect, useRef, useState } from 'react'

import { SCAN_DURATION_MS } from '@/engine/constants'
import { selectScanTarget } from '@/engine/scan'
import { DeepTimePhase } from '@/engine/types'
import { isInputGated } from '@/engine/zoneTransition'
import type { GameState } from '@/engine/types'
import type { PermacomputerScreen } from '@/hooks/useKeyboard'

interface ScanProgressBarProps {
  state: GameState
  activeScreen: PermacomputerScreen
}

// RP-6 — scan widget. Two display modes:
//   1. Hint mode: a scan target is available and the player isn't holding [f].
//      Shows "[f] to sequence." so the player knows the action exists.
//   2. Active mode: state.scanInProgress is non-null. Shows "Sequencing..."
//      with a pink fill animating 0→100% over SCAN_DURATION_MS.
//
// The widget hides entirely whenever input is gated (zone transition, boot
// title), a permacomputer screen is open, a dialog is active, genesis is
// running, or deep time is in a blocking phase. Those are exactly the
// conditions where the [f] keydown is suppressed in useKeyboard.
export const ScanProgressBar = ({ state, activeScreen }: ScanProgressBarProps) => {
  const [, forceTick] = useState(0)
  const rafRef = useRef<number | null>(null)

  // Always poll on rAF so the hint reflects player movement (target
  // appearing / disappearing as the player walks past flora) without
  // requiring the keyboard hook to refresh on every step.
  useEffect(() => {
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
  }, [])

  // Hide whenever any modal blocker is engaged. These mirror the keydown
  // suppression conditions in useKeyboard so the hint never lies about
  // what [f] will do.
  if (isInputGated(state)) return null
  if (activeScreen !== null) return null
  if (state.activeDialog) return null
  if (state.genesis) return null
  if (state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering) return null

  const progress = state.scanInProgress

  // Active mode: scan in progress.
  if (progress) {
    const elapsed = performance.now() - progress.startTime
    const t = Math.max(0, Math.min(1, elapsed / SCAN_DURATION_MS))
    const pct = Math.round(t * 100)
    return (
      <div
        data-panel="scan-progress-bar"
        data-testid="scan-progress-bar"
        className="border-border pointer-events-none fixed bottom-52 left-1/2 z-20 flex w-64 -translate-x-1/2 flex-col gap-1 rounded border bg-black/80 px-3 py-2 font-mono text-xs"
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

  // Hint mode: a target is available but no scan is active.
  const target = selectScanTarget(state)
  if (!target) return null

  return (
    <div
      data-panel="scan-progress-bar"
      data-testid="scan-prompt"
      className="border-border pointer-events-none fixed bottom-52 left-1/2 z-20 -translate-x-1/2 rounded border bg-black/80 px-3 py-2 font-mono text-xs"
    >
      <span className="text-dim">
        <span className="text-text">[F]</span> to sequence.
      </span>
    </div>
  )
}
