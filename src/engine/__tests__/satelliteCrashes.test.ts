import { MAP_HEIGHT, MAP_WIDTH, SATELLITE_SOIL_DAMAGE } from '../constants'
import {
  createGenesisState,
  extractGenesisResult,
  GENESIS_EPOCHS,
  nameToSeed,
  runAllMutations,
} from '../genesis'
import { posKey } from '../position'
import { createGameState } from '../state'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

const runFallEpoch = (seed: number) => {
  const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, seed)
  runAllMutations(sim, GENESIS_EPOCHS)
  return sim
}

describe('genesis satellite crashes', () => {
  it('places between 3 and 9 crashes inclusive after the fall epoch', () => {
    for (const name of ['alice', 'bob', 'carol', 'dan', 'eve']) {
      const sim = runFallEpoch(nameToSeed(name))
      expect(sim.satelliteCrashes.length).toBeGreaterThanOrEqual(3)
      expect(sim.satelliteCrashes.length).toBeLessThanOrEqual(9)
    }
  })

  it('is deterministic for the same steward name', () => {
    const sim1 = runFallEpoch(nameToSeed('Tyler'))
    const sim2 = runFallEpoch(nameToSeed('Tyler'))
    expect(sim1.satelliteCrashes.length).toBe(sim2.satelliteCrashes.length)
    for (let i = 0; i < sim1.satelliteCrashes.length; i++) {
      expect(sim1.satelliteCrashes[i].impactX).toBe(sim2.satelliteCrashes[i].impactX)
      expect(sim1.satelliteCrashes[i].impactY).toBe(sim2.satelliteCrashes[i].impactY)
    }
    expect(Array.from(sim1.craters).sort()).toEqual(Array.from(sim2.craters).sort())
  })

  it('produces a non-empty crater set for typical worlds', () => {
    const sim = runFallEpoch(nameToSeed('Tyler'))
    expect(sim.craters.size).toBeGreaterThan(0)
  })

  it('places impacts only on Dirt or Clover tiles', () => {
    const sim = runFallEpoch(nameToSeed('Tyler'))
    for (const crash of sim.satelliteCrashes) {
      const tile = sim.grid[crash.impactY][crash.impactX].type
      expect([TileType.Dirt, TileType.Clover]).toContain(tile)
    }
  })

  it('excludes water (ponds, rivers) tiles from the crater set', () => {
    const sim = runFallEpoch(nameToSeed('Tyler'))
    for (const key of sim.craters) {
      expect(sim.ponds.has(key)).toBe(false)
      expect(sim.riverPaths.has(key)).toBe(false)
    }
  })

  it('excludes ruin building footprints from the crater set', () => {
    const sim = runFallEpoch(nameToSeed('Tyler'))
    const footprints = new Set<string>()
    for (const ruin of sim.ruins) {
      for (const fp of ruin.buildingFootprints) {
        footprints.add(posKey(fp.x, fp.y))
      }
    }
    for (const key of sim.craters) {
      expect(footprints.has(key)).toBe(false)
    }
  })

  it('excludes space and sand tiles from the crater set', () => {
    const sim = runFallEpoch(nameToSeed('Tyler'))
    for (const key of sim.craters) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const tile = sim.grid[y][x].type
      expect(tile).not.toBe(TileType.Space)
      expect(tile).not.toBe(TileType.Sand)
    }
  })

  it('reduces soil health on cratered tiles by SATELLITE_SOIL_DAMAGE', () => {
    // Run epoch up to (but not through) FallOfCivilizations to capture
    // pre-impact soil values, then run only the fall epoch.
    const seed = nameToSeed('Tyler')
    const preFall = createGenesisState(MAP_WIDTH, MAP_HEIGHT, seed)
    const fallIdx = GENESIS_EPOCHS.findIndex(e => e.id === 'fallOfCivilizations')
    expect(fallIdx).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < fallIdx; i++) {
      GENESIS_EPOCHS[i].mutate(preFall)
    }
    const preSoil = new Map(preFall.soilHealth)
    GENESIS_EPOCHS[fallIdx].mutate(preFall)

    // Soil damage runs after the +3 vegetation-kill enrichment in the same
    // mutate pass, so a cratered tile's final value is at most
    // preSoil + 3 - SATELLITE_SOIL_DAMAGE (clamped to 0). Tiles inside
    // multiple crash zones see damage applied multiple times.
    let checkedTiles = 0
    for (const key of preFall.craters) {
      const before = preSoil.get(key) ?? 30
      const after = preFall.soilHealth.get(key) ?? 0
      const expectedMax = Math.max(0, before + 3 - SATELLITE_SOIL_DAMAGE)
      expect(after).toBeLessThanOrEqual(expectedMax)
      checkedTiles++
    }
    expect(checkedTiles).toBeGreaterThan(0)
  })

  it('exports craters via GenesisResult', () => {
    const sim = runFallEpoch(nameToSeed('Tyler'))
    const result = extractGenesisResult(sim)
    expect(result.craters).toBe(sim.craters)
    expect(result.craters.size).toBe(sim.craters.size)
  })

  it('initializes state.craters from genesis crater data via createGameState', () => {
    const sim = runFallEpoch(nameToSeed('Tyler'))
    const state = createGameState('Tyler', 80, 50, sim)
    expect(state.craters.size).toBe(sim.craters.size)
    for (const key of sim.craters) {
      expect(state.craters.has(key)).toBe(true)
    }
  })
})
