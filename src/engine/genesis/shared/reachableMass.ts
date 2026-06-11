import { isClimbableStep, isWalkableTile, posKey } from '../../position'

import type { Tile } from '../../types'

// RP-41 / RP-49 — Spawn-connected reachable set, gated on both tile
// walkability and the cube-step climbability predicate (one tier
// max per step under RP-49). Read-only with respect to grid/
// elevation — unlike the sibling `enforceConnectivity` (which
// deletes unreachable walkable islands and converts them to Space),
// this pass only computes a Set. Tiles outside the returned cohort
// remain part of the prairie: visible, lit, weathered, flora-
// bearing — just unreachable for the steward's feet. _The prairie
// does not owe the steward access._ (v11 thinktank R3, 2026-05-30)
export const computeReachableMass = (
  grid: Tile[][],
  elevation: Map<string, number>,
  width: number,
  height: number,
  spawnX: number,
  spawnY: number
): Set<string> => {
  const reachable = new Set<string>()
  if (spawnX < 0 || spawnX >= width || spawnY < 0 || spawnY >= height) {
    return reachable
  }
  const startKey = posKey(spawnX, spawnY)
  reachable.add(startKey)
  const queue: { x: number; y: number }[] = [{ x: spawnX, y: spawnY }]

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    for (const [ddx, ddy] of dirs) {
      const nx = current.x + ddx
      const ny = current.y + ddy
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const nk = posKey(nx, ny)
      if (reachable.has(nk)) continue
      const tile = grid[ny][nx]
      if (!isWalkableTile(tile.type)) continue
      if (!isClimbableStep(elevation, current.x, current.y, nx, ny)) continue
      reachable.add(nk)
      queue.push({ x: nx, y: ny })
    }
  }

  return reachable
}
