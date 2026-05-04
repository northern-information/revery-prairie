import { posKey } from '@/engine/position'
import { CloverStage, TileType } from '@/engine/types'
import { registerFloraMovement } from '@/engine/flora/actions/movement'
import { registerFloraPollinate } from '@/engine/flora/actions/pollinate'

import type { GameState } from '@/engine/types'

// ─── clover movement (wind sway) ──────────────────────────────────────────────

// Source constants: flora-wind-sway/src/engine/render/floraWind.ts
// parsedBaseColor: '#50C878' — the brightest of the three healthy clover shades.
// Used by shiftLuminanceFast when LUMINANCE_SHIFT_ENABLED is turned on.

registerFloraMovement(TileType.Clover, {
  baseFreqMs:      0.0015,
  windFreqFactor:  0.0025,
  waveKA:          0.30,
  waveKB:          0.15,
  leanFraction:    0.6,
  dxFraction:      0.10,
  dyFraction:      0.28,
  luminanceRange:  12,
  parsedBaseColor: [80, 200, 120],
  swayFactors: {
    [CloverStage.Healthy]:         1.0,
    [CloverStage.Brown]:           0.5,
    [CloverStage.BlinkingRed]:     0.15,
    [CloverStage.Black]:           0.0,
    [CloverStage.Decomposing]:     0.0,
    [CloverStage.BurntRecovering]: 0.0,
  },
})

// ─── clover pollination ───────────────────────────────────────────────────────

// Count how many of the 8 surrounding tiles are also clover.
const countCloverNeighbors = (state: GameState, tx: number, ty: number): number => {
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      if (state.map[ty + dy]?.[tx + dx]?.type === TileType.Clover) n++
    }
  }
  return n
}

// Gate pollen emission: only healthy clover emits, and interior tiles in large
// blooms emit far less often so big fields read as drifting edges rather than
// uniform glittering.
const cloverEmitGate = (state: GameState, tx: number, ty: number): boolean => {
  const lc = state.cloverLifecycle.get(posKey(tx, ty))
  if (lc !== undefined && lc.stage !== CloverStage.Healthy) return false

  const neighbors = countCloverNeighbors(state, tx, ty)
  if (neighbors >= 6) return Math.random() < 0.15 // deep interior — very rare
  if (neighbors >= 4) return Math.random() < 0.40 // mid-interior — occasional
  return true                                       // edge tiles emit freely
}

registerFloraPollinate(TileType.Clover, {
  glyph:        '.',
  color:        '#b07fc7',
  parsedColor:  [176, 127, 199],
  windThreshold: 8,          // mph — no emission below this
  emitRate:      0.10,       // particles per eligible tile per second at max wind
  minAge:        800,        // ms
  maxAge:        1400,       // ms
  emitGate:      cloverEmitGate,
})
