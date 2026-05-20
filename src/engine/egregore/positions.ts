// Precis #8b — shared position helpers for the egregoric biome.
//
// Extracted from src/engine/revery.ts (precis #4) so both the stewardship-
// winter spread tick and the Revery-time advance can share the same
// candidate-enumeration logic. The trailCentroid + Manhattan-sort logic
// stays in revery.ts since it's revery-specific.

import { isInBounds, ORDINAL, posKey } from '@/engine/position'
import { TileType } from '@/engine/types'

import type { GameState, Position } from '@/engine/types'

// 8-neighbor (ordinal) walk over every existing egregore tile. Returns
// positions of adjacent Dirt tiles, deduplicated by posKey. The Dirt
// filter ensures we never overwrite water, ruins, cave entrances,
// existing egregore tiles, or any other non-Dirt surface.
export const candidateDirtNeighbors = (state: GameState): Position[] => {
  const seen = new Set<string>()
  const candidates: Position[] = []
  for (const pos of state.egregorePositions) {
    for (const d of ORDINAL) {
      const nx = pos.x + d.x
      const ny = pos.y + d.y
      if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
      if (state.map[ny][nx].type !== TileType.Dirt) continue
      const key = posKey(nx, ny)
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({ x: nx, y: ny })
    }
  }
  return candidates
}
