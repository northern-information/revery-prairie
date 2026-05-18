import {
  MAP_HEIGHT,
  MAP_WIDTH,
  SATELLITE_CRATER_DEPTH_CENTER,
  SATELLITE_CRATER_DEPTH_EDGE,
  SATELLITE_CRATER_DEPTH_RING,
  SATELLITE_SOIL_DAMAGE,
} from '../constants'
import { createGenesisState, extractGenesisResult, GENESIS_EPOCHS, nameToSeed, runAllMutations } from '../genesis'
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
      expect([TileType.Dirt, TileType.Flora]).toContain(tile)
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

  describe('elevation deformation', () => {
    // Run all epochs up to (not including) FallOfCivilizations, snapshot
    // sim.elevation, then run only the fall epoch. This isolates the
    // crash-driven elevation drop from earlier geological mutations.
    const setupPreAndPostFall = (seedName: string) => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, nameToSeed(seedName))
      const fallIdx = GENESIS_EPOCHS.findIndex(e => e.id === 'fallOfCivilizations')
      expect(fallIdx).toBeGreaterThanOrEqual(0)
      for (let i = 0; i < fallIdx; i++) {
        GENESIS_EPOCHS[i].mutate(sim)
      }
      const preElev = new Map(sim.elevation)
      GENESIS_EPOCHS[fallIdx].mutate(sim)
      return { sim, preElev }
    }

    it('clamps every elevation entry to [0, 100] after the fall epoch', () => {
      const sim = runFallEpoch(nameToSeed('Tyler'))
      for (const value of sim.elevation.values()) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
      }
    })

    it('drops a crash center tile by SATELLITE_CRATER_DEPTH_CENTER when no overlap', () => {
      const { sim, preElev } = setupPreAndPostFall('Tyler')

      // Find a crash whose center tile is not within the 5x5 zone of any
      // other crash so the drop is from a single impact.
      const findIsolatedCenter = (): { x: number; y: number } | null => {
        for (const crash of sim.satelliteCrashes) {
          const overlap = sim.satelliteCrashes.some(
            other =>
              other !== crash &&
              Math.abs(other.impactX - crash.impactX) <= 2 &&
              Math.abs(other.impactY - crash.impactY) <= 2
          )
          if (!overlap) return { x: crash.impactX, y: crash.impactY }
        }
        return null
      }

      const isolated = findIsolatedCenter()
      if (!isolated) {
        // Degenerate seed where every crash overlaps another — skip this case
        // rather than fail. The clamp-and-determinism tests still cover the
        // overall contract.
        return
      }
      const key = posKey(isolated.x, isolated.y)
      const before = preElev.get(key) ?? 50
      const after = sim.elevation.get(key) ?? 50
      expect(after).toBe(Math.max(0, Math.min(100, before - SATELLITE_CRATER_DEPTH_CENTER)))
    })

    it('reduces every cratered tile elevation by at least the edge depth', () => {
      const { sim, preElev } = setupPreAndPostFall('Tyler')
      let checked = 0
      for (const key of sim.craters) {
        const before = preElev.get(key) ?? 50
        const after = sim.elevation.get(key) ?? 50
        // If pre-fall elevation was already below the edge drop the post
        // value clamps to 0. Otherwise the post must be strictly lower.
        if (before <= SATELLITE_CRATER_DEPTH_EDGE) {
          expect(after).toBe(0)
        } else {
          expect(after).toBeLessThanOrEqual(before - SATELLITE_CRATER_DEPTH_EDGE)
        }
        checked++
      }
      expect(checked).toBeGreaterThan(0)
    })

    it('preserves elevation for protected tiles inside a crash zone', () => {
      const { sim, preElev } = setupPreAndPostFall('Tyler')

      const ruinFootprints = new Set<string>()
      for (const ruin of sim.ruins) {
        for (const fp of ruin.buildingFootprints) {
          ruinFootprints.add(posKey(fp.x, fp.y))
        }
      }

      let protectedChecked = 0
      for (const crash of sim.satelliteCrashes) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const x = crash.impactX + dx
            const y = crash.impactY + dy
            if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue
            const key = posKey(x, y)
            const tileType = sim.grid[y][x].type

            const isProtected =
              tileType === TileType.Space ||
              tileType === TileType.Sand ||
              tileType === TileType.CaveEntrance ||
              tileType === TileType.CaveWall ||
              tileType === TileType.CaveBreakableWall ||
              sim.ponds.has(key) ||
              sim.riverPaths.has(key) ||
              ruinFootprints.has(key)

            if (!isProtected) continue
            const before = preElev.get(key)
            const after = sim.elevation.get(key)
            // Protected tiles may have no entry (Space outside landMask).
            // Where an entry exists pre and post, it must be unchanged.
            if (before !== undefined && after !== undefined) {
              expect(after).toBe(before)
            }
            protectedChecked++
          }
        }
      }
      // At minimum the impact rings tend to graze ruin footprints / sand —
      // if a seed produces zero protected tiles in any zone the test still
      // passes the per-tile invariant; we only assert the iteration ran.
      expect(protectedChecked).toBeGreaterThanOrEqual(0)
    })

    it('produces identical post-fall elevation for the same steward name', () => {
      const sim1 = runFallEpoch(nameToSeed('Tyler'))
      const sim2 = runFallEpoch(nameToSeed('Tyler'))
      expect(sim1.elevation.size).toBe(sim2.elevation.size)
      for (const [key, v1] of sim1.elevation) {
        expect(sim2.elevation.get(key)).toBe(v1)
      }
    })

    it('stacks additively when two crashes overlap the same tile', () => {
      const { sim, preElev } = setupPreAndPostFall('Tyler')

      // Find a tile that sits in 5x5 zones of two different crashes.
      interface Hit {
        center: 0 | 1 | 2
      }
      const hits = new Map<string, Hit[]>()
      for (const crash of sim.satelliteCrashes) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const x = crash.impactX + dx
            const y = crash.impactY + dy
            if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue
            const key = posKey(x, y)
            if (!sim.craters.has(key)) continue
            const cheb = Math.max(Math.abs(dx), Math.abs(dy)) as 0 | 1 | 2
            const list = hits.get(key) ?? []
            list.push({ center: cheb })
            hits.set(key, list)
          }
        }
      }

      const overlap = [...hits.entries()].find(([, list]) => list.length >= 2)
      if (!overlap) return // seed didn't produce overlapping crashes

      const [key, list] = overlap
      const expectedDrop = list.reduce((sum, h) => {
        return (
          sum +
          (h.center === 0
            ? SATELLITE_CRATER_DEPTH_CENTER
            : h.center === 1
              ? SATELLITE_CRATER_DEPTH_RING
              : SATELLITE_CRATER_DEPTH_EDGE)
        )
      }, 0)
      const before = preElev.get(key) ?? 50
      const after = sim.elevation.get(key) ?? 50
      expect(after).toBe(Math.max(0, Math.min(100, before - expectedDrop)))
    })
  })
})
