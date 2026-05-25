import { posKey } from '../../position'
import { TileType } from '../../types'

import type { GenesisSimState } from '../../genesisTypes'

// ---------------------------------------------------------------------------
// Connectivity enforcement — remove unreachable walkable islands
// ---------------------------------------------------------------------------

export const enforceConnectivity = (sim: GenesisSimState): void => {
  const spawnX = Math.floor(sim.width / 2)
  const spawnY = Math.floor(sim.height / 2)

  // BFS from the exact map center (Gron's tile, adjacent to the player
  // spawn) through walkable tiles (including water overlay positions)
  const startKey = posKey(spawnX, spawnY)
  const reachable = new Set<string>()
  const queue: string[] = [startKey]
  reachable.add(startKey)

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    const [xStr, yStr] = current.split(',')
    const cx = Number(xStr)
    const cy = Number(yStr)

    for (const [ddx, ddy] of dirs) {
      const nx = cx + ddx
      const ny = cy + ddy
      if (nx < 0 || nx >= sim.width || ny < 0 || ny >= sim.height) continue
      const nk = posKey(nx, ny)
      if (reachable.has(nk)) continue

      const tile = sim.grid[ny][nx]
      // Walkable = anything that's not Space, CaveWall, or CaveBreakableWall
      if (tile.type === TileType.Space || tile.type === TileType.CaveWall || tile.type === TileType.CaveBreakableWall) {
        continue
      }

      reachable.add(nk)
      queue.push(nk)
    }
  }

  // Convert unreachable walkable tiles to Space
  for (let y = 0; y < sim.height; y++) {
    for (let x = 0; x < sim.width; x++) {
      const tile = sim.grid[y][x]
      if (tile.type === TileType.Space) continue
      if (tile.type === TileType.CaveWall || tile.type === TileType.CaveBreakableWall) continue
      if (tile.type === TileType.CaveEntrance) continue // preserve cave entrances

      const key = posKey(x, y)
      if (reachable.has(key)) continue // reachable — keep it

      // Unreachable walkable tile — convert to space and clean up
      sim.grid[y][x] = { type: TileType.Space }
      sim.landMask.delete(key)
      sim.coastlineTiles.delete(key)
      sim.soilHealth.delete(key)
      sim.elevation.delete(key)
    }
  }
}
