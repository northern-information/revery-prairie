import { registerFloraMovement } from '@/engine/flora/actions/movement'
import { registerFloraPollinate } from '@/engine/flora/actions/pollinate'
import { posKey } from '@/engine/position'
import { FloraSpecies, FloraStage, TileType } from '@/engine/types'
import type { GameState } from '@/engine/types'

// ─── clover movement (wind sway) ──────────────────────────────────────────────

registerFloraMovement(TileType.Flora, {
  baseFreqMs: 0.0015,
  windFreqFactor: 0.0025,
  waveKA: 0.3,
  waveKB: 0.15,
  leanFraction: 0.6,
  dxFraction: 0.1,
  dyFraction: 0.28,
  swayFactors: {
    [FloraStage.Healthy]: 1.0,
    [FloraStage.Brown]: 0.5,
    [FloraStage.BlinkingRed]: 0.15,
    [FloraStage.Black]: 0.0,
    [FloraStage.Decomposing]: 0.0,
    [FloraStage.BurntRecovering]: 0.0,
  },
})

// ─── clover pollination ───────────────────────────────────────────────────────

// Count how many of the 8 surrounding tiles are also clover (species-aware
// — wildflower and tall grass tiles share TileType.Flora but do not feed
// the clover-only pollen field).
const countCloverNeighbors = (state: GameState, tx: number, ty: number): number => {
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const ny = ty + dy
      const nx = tx + dx
      if (state.map[ny]?.[nx]?.type !== TileType.Flora) continue
      const lc = state.floraLifecycle.get(posKey(nx, ny))
      if (lc?.species === FloraSpecies.Clover) n++
    }
  }
  return n
}

// Gate pollen emission: only healthy clover emits, and interior tiles in large
// blooms emit far less often so big fields read as drifting edges rather than
// uniform glittering. Pollen drift is clover-specific per RP-1; the
// broader pollinator routes are deferred to RP-7.
const cloverEmitGate = (state: GameState, tx: number, ty: number): boolean => {
  const lc = state.floraLifecycle.get(posKey(tx, ty))
  if (lc?.species !== FloraSpecies.Clover) return false
  if (lc.stage !== FloraStage.Healthy) return false

  const neighbors = countCloverNeighbors(state, tx, ty)
  if (neighbors >= 6) return Math.random() < 0.15 // deep interior — very rare
  if (neighbors >= 4) return Math.random() < 0.4 // mid-interior — occasional
  return true // edge tiles emit freely
}

registerFloraPollinate(TileType.Flora, {
  glyph: '.',
  color: '#b07fc7',
  parsedColor: [176, 127, 199],
  windThreshold: 8, // mph — no emission below this
  emitRate: 0.4, // particles per eligible tile per second at max wind (calibrated for ZOOM_DEFAULT viewport)
  minAge: 800, // ms
  maxAge: 1400, // ms
  emitGate: cloverEmitGate,
})
