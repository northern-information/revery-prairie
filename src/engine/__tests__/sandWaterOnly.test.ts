import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import {
  createGenesisState,
  extractGenesisResult,
  GENESIS_EPOCHS,
  runAllMutations,
} from '../genesis'
import { posKey } from '../position'
import { generateTerrain } from '../terrain'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

// Sand only ever borders water; it never borders Space. This invariant
// captures the visual decision that the dirt-to-Space coastline is a
// hard cliff into the void, and Sand exists only as a riverbank /
// pond shore. Regression: prior generation placed a SAND_BORDER ring
// around the island, which read as flat-against-Space in iso mode.

describe('sand-water-only invariant', () => {
  it('generateTerrain (no-genesis fallback) produces no Sand tiles at all', () => {
    const terrain = generateTerrain(MAP_WIDTH, MAP_HEIGHT)
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        expect(terrain[y][x].type).not.toBe(TileType.Sand)
      }
    }
  })

  it('genesis output has no Sand tile bordering a Space tile', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const { terrain } = extractGenesisResult(sim)
    const cardinals = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (terrain[y][x].type !== TileType.Sand) continue
        for (const [dx, dy] of cardinals) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue
          expect(terrain[ny][nx].type).not.toBe(TileType.Space)
        }
      }
    }
  })

  it('every Sand tile is reachable from a water tile via Sand+water adjacency (sand always borders water, directly or through other Sand)', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 7)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)
    const waterKeys = new Set<string>()
    for (const key of result.rivers) waterKeys.add(key)
    for (const key of result.ponds) waterKeys.add(key)
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]
    // BFS from every water tile through sand+water; mark every reachable
    // sand tile. Any sand tile not reached is an orphan (= a sandbar not
    // connected to any water body), which would violate the invariant.
    const reachable = new Set<string>()
    const queue: string[] = []
    for (const key of waterKeys) {
      reachable.add(key)
      queue.push(key)
    }
    while (queue.length > 0) {
      const key = queue.shift()
      if (key === undefined) break
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      for (const [dx, dy] of dirs) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue
        const nk = posKey(nx, ny)
        if (reachable.has(nk)) continue
        if (result.terrain[ny][nx].type !== TileType.Sand) continue
        reachable.add(nk)
        queue.push(nk)
      }
    }
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (result.terrain[y][x].type !== TileType.Sand) continue
        expect(reachable.has(posKey(x, y))).toBe(true)
      }
    }
  })
})
