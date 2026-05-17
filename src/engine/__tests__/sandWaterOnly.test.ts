import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { createGenesisState, extractGenesisResult, GENESIS_EPOCHS, runAllMutations } from '../genesis'
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

  it('every Sand tile traces back to a shoreline-eligible water seed (pond, river mouth, or river-pond junction) — thin midstream river tiles seed no sand', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 13)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    // Reconstruct the eligible seed set the way fallOfCivilizations.mutate
    // builds it: every kept pond, the last surviving tile of each kept
    // river polyline (mouth), and any river tile cardinally adjacent to
    // a pond (river-pond junction).
    const cardinals = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
    const eligible = new Set<string>()
    for (const key of result.ponds) eligible.add(key)
    for (const polyline of sim.riverPathsOrdered) {
      for (let i = polyline.length - 1; i >= 0; i--) {
        const mouthKey = posKey(polyline[i].x, polyline[i].y)
        if (result.rivers.has(mouthKey)) {
          eligible.add(mouthKey)
          break
        }
      }
    }
    for (const riverKey of result.rivers) {
      const [rxStr, ryStr] = riverKey.split(',')
      const rx = Number(rxStr)
      const ry = Number(ryStr)
      for (const [dx, dy] of cardinals) {
        if (result.ponds.has(posKey(rx + dx, ry + dy))) {
          eligible.add(riverKey)
          break
        }
      }
    }

    // BFS through Sand cells from the eligible seeds. Every Sand tile
    // produced by the shoreline pass must be reachable; any unreachable
    // Sand tile would mean it was seeded from a midstream river tile.
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
    const reachable = new Set<string>(eligible)
    const queue: string[] = [...eligible]
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

  it('places sand adjacent to ponds (smoke test — shoreline pass actually runs)', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)
    let sandCount = 0
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (result.terrain[y][x].type === TileType.Sand) sandCount++
      }
    }
    expect(sandCount).toBeGreaterThan(0)
  })
})
