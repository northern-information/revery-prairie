import { useEffect, useRef, useState } from 'react'

import { ZONE_TRANSITION_FADE_IN_MS, ZONE_TRANSITION_FADE_OUT_MS, ZONE_TRANSITION_HOLD_MS } from '@/engine/constants'
import type { GameState } from '@/engine/types'

// Triangle wave: 0 → 1 across fade-in, 1 across hold, 1 → 0 across
// fade-out. Identical curve to the zone-transition overlay so the two
// look alike.
const overlayAlpha = (elapsed: number): number => {
  if (elapsed <= 0) return 0
  if (elapsed < ZONE_TRANSITION_FADE_IN_MS) {
    return elapsed / ZONE_TRANSITION_FADE_IN_MS
  }
  const holdEnd = ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS
  if (elapsed < holdEnd) return 1
  const total = holdEnd + ZONE_TRANSITION_FADE_OUT_MS
  if (elapsed < total) {
    return 1 - (elapsed - holdEnd) / ZONE_TRANSITION_FADE_OUT_MS
  }
  return 0
}

// DOM overlay for the boot title card. Sits above the canvas and any
// DOM overlays (genesis bottom bar at z-10) via z-50 so the black
// cover hides the year readout during the title-card hold.
export const BootTitleCardOverlay = ({ state }: { state: GameState }): React.ReactElement | null => {
  const [, force] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    const loop = (): void => {
      if (!alive) return
      force(n => n + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      alive = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const card = state.bootTitleCard
  if (!card) return null

  const elapsed = performance.now() - card.startTime
  const alpha = overlayAlpha(elapsed)
  if (alpha <= 0) return null

  return (
    <div
      data-panel="boot-title-card"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black"
      style={{ opacity: alpha }}
    >
      <p className="font-serif text-6xl italic" style={{ color: '#d8a860' }}>
        {card.label}
      </p>
    </div>
  )
}
