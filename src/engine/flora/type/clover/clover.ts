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

// Only healthy clover emits pollen — lifecycle gate injected here so
// pollinate.ts stays generic and clover-knowledge lives in this file.
const cloverEmitGate = (state: GameState, tx: number, ty: number): boolean => {
  const lc = state.cloverLifecycle.get(posKey(tx, ty))
  return lc === undefined || lc.stage === CloverStage.Healthy
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
