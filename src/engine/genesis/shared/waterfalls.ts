import { CLIMBABLE_STEP_THRESHOLD, isWalkableTile, posKey } from '../../position'

import type { Tile, Waterfall } from '../../types'

// RP-64 — Detect waterfalls. Iterates the union of rivers and
// ponds; for each water tile, checks the four cardinal neighbors
// and records a Waterfall when the neighbor is on-grid, walkable
// by tile type, NOT itself a river/pond, AND drops by more than
// the climbable-step threshold. When a top tile has multiple
// qualifying lower neighbors, the steepest drop wins (single
// Waterfall per top tile — keeps render math simple).
//
// Pure with respect to inputs — never mutates grid, elevation,
// rivers, or ponds. _The prairie does not maintain dishonesty_:
// every waterfall traces to a source.
//
// Read by state.ts at construction; recomputed by future RP-44
// winter geology when elevation mutates.
const CARDINAL_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

export const detectWaterfalls = (
  grid: Tile[][],
  elevation: Map<string, number>,
  rivers: Set<string>,
  ponds: Set<string>,
  width: number,
  height: number,
  threshold: number = CLIMBABLE_STEP_THRESHOLD
): Map<string, Waterfall> => {
  const waterfalls = new Map<string, Waterfall>()
  const waterTiles = new Set<string>([...rivers, ...ponds])

  for (const key of waterTiles) {
    const [xStr, yStr] = key.split(',')
    const tx = Number(xStr)
    const ty = Number(yStr)
    const topElev = elevation.get(key)
    if (topElev === undefined) continue

    let bestDrop = 0
    let bestBottomX = -1
    let bestBottomY = -1
    for (const [dx, dy] of CARDINAL_DIRS) {
      const nx = tx + dx
      const ny = ty + dy
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const nk = posKey(nx, ny)
      if (waterTiles.has(nk)) continue
      const nElev = elevation.get(nk)
      if (nElev === undefined) continue
      if (!isWalkableTile(grid[ny][nx].type)) continue
      const drop = topElev - nElev
      if (drop <= threshold) continue
      if (drop > bestDrop) {
        bestDrop = drop
        bestBottomX = nx
        bestBottomY = ny
      }
    }
    if (bestDrop > 0) {
      waterfalls.set(key, {
        topX: tx,
        topY: ty,
        bottomX: bestBottomX,
        bottomY: bestBottomY,
        frozen: false,
      })
    }
  }

  return waterfalls
}
