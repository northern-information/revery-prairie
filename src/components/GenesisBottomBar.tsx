import { useEffect, useRef, useState } from 'react'

import { formatYearsAgo, GENESIS_EPOCHS, getEpochProgress, getGenesisYear } from '@/engine/genesis'
import type { GameState } from '@/engine/types'

// Bottom-center reverse-projection readout for the genesis sequence.
// Mirrors the ScanProgressBar's bordered-card shape: a label line on
// top showing the tilde-prefixed year (formatYearsAgo) and a gold fill
// bar below tracking overall derivation progress from epoch 0 to
// handoff. The rAF loop keeps both the readout and the bar ticking
// under the continuous epoch lerp; the formatter rounds the year into
// honest bands so the display never claims more precision than geology
// can cite.
export const GenesisBottomBar = ({ state }: { state: GameState }): React.ReactElement | null => {
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

  const sim = state.genesis
  if (!sim) return null

  const year = getGenesisYear(sim, GENESIS_EPOCHS)
  const isPastFinalEpoch = sim.epochIndex >= GENESIS_EPOCHS.length
  const inEpochProgress = isPastFinalEpoch ? 1 : getEpochProgress(sim, GENESIS_EPOCHS)
  const overall = (sim.epochIndex + inEpochProgress) / GENESIS_EPOCHS.length
  const pct = Math.round(Math.max(0, Math.min(1, overall)) * 100)

  return (
    <div
      data-panel="genesis-bottom-bar"
      className="border-border pointer-events-none fixed bottom-52 left-1/2 z-10 flex w-64 -translate-x-1/2 flex-col gap-1 rounded border bg-black/80 px-3 py-2 font-mono text-xs"
    >
      <div className="tabular-nums" style={{ color: '#d8a860' }}>
        {formatYearsAgo(year)}
      </div>
      <div className="border-border h-2 w-full overflow-hidden border bg-black/50">
        <div
          className="h-full transition-[width] duration-75 ease-linear"
          style={{ width: `${String(pct)}%`, backgroundColor: '#d8a860' }}
        />
      </div>
    </div>
  )
}
