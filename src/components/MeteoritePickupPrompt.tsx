// RP-18 — [F] Pickup hint that appears whenever a placed meteorite
// sits under the steward's foot or in their facing direction. Mirrors
// the ScanProgressBar hint mode for visual consistency (same border,
// same font, same fixed-bottom-center placement, just one row higher
// so it doesn't collide with the scan prompt when both are eligible).
//
// Polls on requestAnimationFrame so the hint appears the moment the
// steward walks onto or faces a placed meteorite — useKeyboard does not
// call refreshUI on every path-tick step, and the canvas-side highlight
// already updates per-frame; this matches that cadence for the DOM hint.

import { useEffect, useRef, useState } from 'react'

import { findPickupableMeteorite } from '@/engine/interaction'
import type { GameState } from '@/engine/types'

interface Props {
  state: GameState
}

export const MeteoritePickupPrompt = ({ state }: Props) => {
  const [, forceTick] = useState(0)
  const rafRef = useRef<number | null>(null)
  useEffect(() => {
    const tick = () => {
      forceTick(n => n + 1)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  if (!findPickupableMeteorite(state)) return null
  return (
    <div
      data-panel="meteorite-pickup-prompt"
      className="border-border pointer-events-none fixed bottom-64 left-1/2 z-20 -translate-x-1/2 rounded border bg-black/80 px-3 py-2 font-mono text-xs"
    >
      <span className="text-dim">
        <span className="text-text">[F]</span> Pickup Meteorite
      </span>
    </div>
  )
}
