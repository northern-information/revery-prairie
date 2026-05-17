import { useEffect, useRef, useState } from 'react'

import { formatYear, GENESIS_EPOCHS, getEpochProgress, getGenesisCommentary, getGenesisYear } from '@/engine/genesis'
import type { GameState } from '@/engine/types'

// Genesis commentary: large italic gold line + year subtitle in a
// gameplay-style bottom bar (192px, bg-black/70). Year ticks every
// frame so the rolling counter reads as alive throughout the fades.
// Commentary fades in/out tied to epoch progress so each line breathes
// before the next replaces it.
export const GenesisBottomBar = ({ state }: { state: GameState }): React.ReactElement | null => {
  const [, force] = useState(0)
  const rafRef = useRef<number | null>(null)

  // Run a render-loop while genesis is active so the year counter and
  // commentary fade stay smooth between gameLoop refresh ticks.
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

  const sim = state.genesis
  if (!sim) return null

  const isPastFinalEpoch = sim.epochIndex >= GENESIS_EPOCHS.length
  const now = performance.now()
  const progress = isPastFinalEpoch ? 1 : getEpochProgress(sim, GENESIS_EPOCHS)
  const commentary = isPastFinalEpoch
    ? GENESIS_EPOCHS[GENESIS_EPOCHS.length - 1].commentary
    : getGenesisCommentary(sim, GENESIS_EPOCHS)
  const year = getGenesisYear(sim, GENESIS_EPOCHS, now)

  // Commentary fades in across the first fraction of the epoch and
  // out across the last fraction; year stays at full opacity always.
  const FADE_IN = 0.15
  const FADE_OUT = 0.15
  const commentaryAlpha =
    progress < FADE_IN ? progress / FADE_IN : progress > 1 - FADE_OUT ? Math.max(0, (1 - progress) / FADE_OUT) : 1

  return (
    <div
      data-panel="genesis-bottom-bar"
      className="pointer-events-none fixed right-4 bottom-4 z-10 text-right font-serif"
    >
      <p className="text-lg italic" style={{ color: '#d8a860', opacity: commentaryAlpha }}>
        {commentary}
      </p>
      <p className="font-mono text-xl tabular-nums" style={{ color: '#d8a860' }}>
        {formatYear(year)}
      </p>
      <p className="text-xs italic" style={{ color: '#a68850' }}>
        Years Since Genesis
      </p>
    </div>
  )
}
