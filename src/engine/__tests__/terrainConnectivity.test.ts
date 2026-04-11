import { MAP_HEIGHT, MAP_WIDTH, SPACE_BORDER } from '../constants'
import { ComponentType } from '../ecs/types'
import {
  createGenesisState,
  enforceConnectivity,
  extractGenesisResult,
  GENESIS_EPOCHS,
  runAllMutations,
} from '../genesis'
import { isWalkableTile, posKey } from '../position'
import { createGameState } from '../state'
import { TileType, Zone } from '../types'
import { describe, expect, it } from 'vitest'

import type { GenesisSimState } from '../genesisTypes'
import type { Tile } from '../types'

/**
 * BFS flood-fill from a start position through walkable, non-blocked tiles.
 * Returns the set of reachable tile keys.
 */
const floodFill = (
  map: Tile[][],
  width: number,
  height: number,
  startX: number,
  startY: number,
  blocked: Set<string>
): Set<string> => {
  const reachable = new Set<string>()
  const start = posKey(startX, startY)
  const queue: string[] = [start]
  reachable.add(start)

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

    for (const [dx, dy] of dirs) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const nk = posKey(nx, ny)
      if (reachable.has(nk)) continue
      if (blocked.has(nk)) continue
      if (!isWalkableTile(map[ny][nx].type)) continue
      reachable.add(nk)
      queue.push(nk)
    }
  }

  return reachable
}

/**
 * Run genesis with a fixed seed and return the sim + result.
 */
const runGenesis = (seed: number): { sim: GenesisSimState; result: ReturnType<typeof extractGenesisResult> } => {
  const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, seed)
  runAllMutations(sim, GENESIS_EPOCHS)
  const result = extractGenesisResult(sim)
  return { sim, result }
}

describe('terrain connectivity', () => {
  it('all walkable tiles are reachable from player spawn', () => {
    const { result } = runGenesis(12345)

    const playerX = Math.floor(MAP_WIDTH / 2)
    const playerY = Math.floor(MAP_HEIGHT / 2)

    const reachable = floodFill(result.terrain, MAP_WIDTH, MAP_HEIGHT, playerX, playerY, new Set<string>())

    // Every walkable tile on the map must be reachable
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = result.terrain[y][x]
        if (!isWalkableTile(tile.type)) continue
        const key = posKey(x, y)
        expect(reachable.has(key)).toBe(true)
      }
    }
  })

  it('water body count is between 0 and 3', () => {
    const { sim } = runGenesis(12345)

    // Unify all water tiles
    const allWater = new Set<string>()
    for (const key of sim.ponds) allWater.add(key)
    for (const key of sim.riverPaths) allWater.add(key)

    // Count connected components via BFS
    const visited = new Set<string>()
    let componentCount = 0
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]

    for (const startKey of allWater) {
      if (visited.has(startKey)) continue
      componentCount++
      const stack = [startKey]
      visited.add(startKey)

      while (stack.length > 0) {
        const current = stack.pop()
        if (current === undefined) break
        const [xStr, yStr] = current.split(',')
        const cx = Number(xStr)
        const cy = Number(yStr)
        for (const [dx, dy] of dirs) {
          const nk = posKey(cx + dx, cy + dy)
          if (allWater.has(nk) && !visited.has(nk)) {
            visited.add(nk)
            stack.push(nk)
          }
        }
      }
    }

    expect(componentCount).toBeGreaterThanOrEqual(0)
    expect(componentCount).toBeLessThanOrEqual(3)
  })

  it('organic coastline has non-rectangular variation', () => {
    const { result } = runGenesis(12345)

    // Sample the x-coordinate where coastline transitions from space to non-space
    // along multiple rows (left edge)
    const leftEdgeXCoords: number[] = []
    for (let y = 20; y < MAP_HEIGHT - 20; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (result.terrain[y][x].type !== TileType.Space) {
          leftEdgeXCoords.push(x)
          break
        }
      }
    }

    // Compute standard deviation of edge x-coordinates
    const mean = leftEdgeXCoords.reduce((sum, v) => sum + v, 0) / leftEdgeXCoords.length
    const variance = leftEdgeXCoords.reduce((sum, v) => sum + (v - mean) ** 2, 0) / leftEdgeXCoords.length
    const stdDev = Math.sqrt(variance)

    // With amplitude=6, wavelength=12, stddev should be well above 2
    expect(stdDev).toBeGreaterThan(2)
  })

  it('entities only spawn on reachable tiles', () => {
    const { result } = runGenesis(12345)
    const state = createGameState('TestSteward', 20, 20, result)

    const playerX = state.player.x
    const playerY = state.player.y

    const reachable = floodFill(state.map, state.mapWidth, state.mapHeight, playerX, playerY, new Set<string>())

    // Query all character entities on the overworld
    // (ghosts, gron — not moab who is in the cave)
    for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
      const pos = state.world.getComponent(eid, ComponentType.Position)
      const zone = state.world.getComponent(eid, ComponentType.EntityZone)
      if (!pos) continue
      // Skip cave-zone entities
      if (zone?.zone === Zone.Cave) continue

      const key = posKey(pos.x, pos.y)
      const tile = state.map[pos.y]?.[pos.x]
      expect(tile).toBeDefined()
      expect(isWalkableTile(tile.type)).toBe(true)
      expect(reachable.has(key)).toBe(true)
    }
  })

  it('enforceConnectivity removes disconnected islands', () => {
    // Create a small genesis state and manually place a disconnected island
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 99999)
    runAllMutations(sim, GENESIS_EPOCHS)

    // Find a space tile far from center and manually create a small dirt island
    const islandX = 3
    const islandY = 3
    sim.grid[islandY][islandX] = { type: TileType.Dirt }
    sim.landMask.add(posKey(islandX, islandY))

    enforceConnectivity(sim)

    // The isolated island tile should have been converted to space
    expect(sim.grid[islandY][islandX].type).toBe(TileType.Space)
    expect(sim.landMask.has(posKey(islandX, islandY))).toBe(false)
  })

  it('no interior space tiles across multiple seeds', () => {
    const seeds = [1, 42, 100, 12345, 99999, 7777, 54321]
    // Coastline noise amplitude is 6, so space can extend up to SPACE_BORDER + 6
    // tiles from each edge. Use SPACE_BORDER + 7 to safely clear the coastline.
    const margin = SPACE_BORDER + 7

    for (const seed of seeds) {
      const { result } = runGenesis(seed)

      let interiorSpaceCount = 0
      for (let y = margin; y < MAP_HEIGHT - margin; y++) {
        for (let x = margin; x < MAP_WIDTH - margin; x++) {
          if (result.terrain[y][x].type !== TileType.Space) continue

          // Count non-space cardinal neighbors
          let nonSpaceNeighbors = 0
          if (result.terrain[y - 1][x].type !== TileType.Space) nonSpaceNeighbors++
          if (result.terrain[y + 1][x].type !== TileType.Space) nonSpaceNeighbors++
          if (result.terrain[y][x - 1].type !== TileType.Space) nonSpaceNeighbors++
          if (result.terrain[y][x + 1].type !== TileType.Space) nonSpaceNeighbors++

          if (nonSpaceNeighbors >= 3) {
            interiorSpaceCount++
          }
        }
      }

      expect(interiorSpaceCount, `seed ${String(seed)} has ${String(interiorSpaceCount)} interior space tiles`).toBe(0)
    }
  })
})
