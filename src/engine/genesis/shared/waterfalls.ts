import { isWalkableTile, posKey } from '../../position'
import { getElevationTier } from '../../tileBg'

import type { Tile, Waterfall } from '../../types'

// RP-64 / RP-49 — Detect waterfalls. Iterates the union of rivers
// and ponds; for each water tile, checks the four cardinal
// neighbors and records a Waterfall when the neighbor is on-grid,
// walkable by tile type, NOT itself a river/pond, AND the elevation
// tier drop is two or more cubes (an unclimbable cube step under
// the RP-49 cube-step rule). When a top tile has multiple
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
  height: number
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
    const topTier = getElevationTier(topElev)
    for (const [dx, dy] of CARDINAL_DIRS) {
      const nx = tx + dx
      const ny = ty + dy
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const nk = posKey(nx, ny)
      if (waterTiles.has(nk)) continue
      const nElev = elevation.get(nk)
      if (nElev === undefined) continue
      if (!isWalkableTile(grid[ny][nx].type)) continue
      const tierDrop = topTier - getElevationTier(nElev)
      if (tierDrop < 2) continue
      const drop = topElev - nElev
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
