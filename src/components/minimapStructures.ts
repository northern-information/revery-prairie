import { Zone } from '@/engine/types'
import { getTileVisibility, hasFogOfWar } from '@/engine/visibility'
import type { GameState, Position } from '@/engine/types'

export const isTileExplored = (
  state: GameState,
  x: number,
  y: number,
  visibleSet: Set<string> | null
): boolean => {
  if (!hasFogOfWar(state.currentZone)) return true
  const vis = getTileVisibility(state, x, y, visibleSet ?? new Set())
  return vis !== 'unexplored'
}

// Returns the ruin building-footprint tiles that should render on the
// minimap this frame, filtered by per-tile fog state. Exported so the
// fog-gating predicate is testable in isolation; drawStructures
// delegates here so future structure-layer additions cannot bypass the
// gate by copy-paste.
export const getVisibleRuinFootprints = (state: GameState, visibleSet: Set<string> | null): Position[] => {
  if (state.currentZone !== Zone.Overworld) return []
  const out: Position[] = []
  for (const ruin of state.civilizationRuins) {
    for (const pos of ruin.buildingFootprints) {
      if (isTileExplored(state, pos.x, pos.y, visibleSet)) {
        out.push(pos)
      }
    }
  }
  return out
}
