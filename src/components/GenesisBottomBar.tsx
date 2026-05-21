import { useEffect, useRef, useState } from 'react'

import { formatYearsAgo, GENESIS_EPOCHS, getGenesisYear } from '@/engine/genesis'
import type { GameState } from '@/engine/types'

// Bottom-right reverse-projection year readout for the genesis sequence.
// Single line, monospace, tilde-prefixed, banded precision via
// formatYearsAgo. The rAF loop keeps the readout ticking under the
// continuous epoch lerp; the formatter rounds into honest bands so the
// display never claims more precision than geology can cite.
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

  return (
    <div
      data-panel="genesis-bottom-bar"
      className="pointer-events-none fixed right-4 bottom-4 z-10 text-right"
    >
      <p className="font-mono text-xl tabular-nums" style={{ color: '#d8a860' }}>
        {formatYearsAgo(year)}
      </p>
    </div>
  )
}
