import { describe, expect, it, vi } from 'vitest'
import { assignArchetype, checkRuinTransition, enterRuin, exitRuin, generateAllRuinInteriors, generateRuinInterior, isInCurrentZone, placeRuinEntrances, tickSubsidenceCollapse } from '../ruins'
import { RuinArchetype, TileType, Zone } from '../types'
import { createGameState } from '../state'
import { isWalkableTile, posKey } from '../position'
import { ITEM_DEFINITIONS } from '../items'

import type { CivilizationRuin } from '../genesisTypes'
import type { Tile } from '../types'

const withSeededRandom = <T>(seed: number, fn: () => T): T => {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(seed / 2147483647)
  try {
    return fn()
  } finally {
    spy.mockRestore()
  }
}

const SEED = 42

const makeRuin = (overrides: Partial<CivilizationRuin> = {}): CivilizationRuin => ({
  position: { x: 50, y: 50 },
  name: 'Test Ruin',
  radius: 4,
  age: 3000,
  aqueductPaths: [
    [{ x: 50, y: 50 }, { x: 60, y: 50 }],
  ],
  buildingFootprints: [
    { x: 50, y: 50 }, { x: 51, y: 50 }, { x: 52, y: 50 },
  ],
  ...overrides,
})

describe('ruin infrastructure', () => {
  describe('archetype assignment', () => {
    it('is deterministic for the same ruin and rng seed', () => {
      const ruin = makeRuin()
      const makeRng = () => {
        let a = 12345 | 0
        return () => {
          a = (a + 0x6d2b79f5) | 0
          let t = Math.imul(a ^ (a >>> 15), 1 | a)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
      }
      const result1 = assignArchetype(ruin, 0, makeRng())
      const result2 = assignArchetype(ruin, 0, makeRng())
      expect(result1).toBe(result2)
    })

    it('returns a valid archetype', () => {
      const ruin = makeRuin()
      let a = 99999 | 0
      const rng = () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      const result = assignArchetype(ruin, 0, rng)
      expect(Object.values(RuinArchetype)).toContain(result)
    })
  })

  describe('ruin interior generation', () => {
    it('generates a map with correct dimensions', () => {
      const ruin = makeRuin({ radius: 4 })
      let a = 42 | 0
      const rng = () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      const interior = generateRuinInterior(ruin, 0, RuinArchetype.Subsidence, rng)
      expect(interior.mapWidth).toBe(4 * 8 + 10)
      expect(interior.mapHeight).toBe(4 * 6 + 8)
      expect(interior.map).toHaveLength(interior.mapHeight)
      expect(interior.map[0]).toHaveLength(interior.mapWidth)
    })

    it('places a RuinEntrance tile at the bottom center', () => {
      const ruin = makeRuin({ radius: 3 })
      let a = 42 | 0
      const rng = () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      const interior = generateRuinInterior(ruin, 0, RuinArchetype.Subsidence, rng)
      const entranceX = Math.floor(interior.mapWidth / 2)
      const entranceY = interior.mapHeight - 2
      expect(interior.map[entranceY][entranceX].type).toBe(TileType.RuinEntrance)
    })

    it('has walkable floor tiles near the entrance', () => {
      const ruin = makeRuin({ radius: 3 })
      let a = 42 | 0
      const rng = () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      const interior = generateRuinInterior(ruin, 0, RuinArchetype.Subsidence, rng)
      const { x, y } = interior.entranceInterior
      expect(isWalkableTile(interior.map[y][x].type)).toBe(true)
    })

    it('is deterministic for the same ruin', () => {
      const ruins = [makeRuin()]
      const interiors1 = generateAllRuinInteriors(ruins)
      const interiors2 = generateAllRuinInteriors(ruins)
      expect(interiors1[0].archetype).toBe(interiors2[0].archetype)
      expect(interiors1[0].mapWidth).toBe(interiors2[0].mapWidth)
      expect(interiors1[0].mapHeight).toBe(interiors2[0].mapHeight)
    })
  })

  describe('overworld entrance placement', () => {
    it('places RuinEntrance tiles on the overworld map', () => {
      const map: Tile[][] = Array.from({ length: 100 }, () =>
        Array.from({ length: 100 }, () => ({ type: TileType.Dirt })),
      )
      const ruins = [makeRuin({ position: { x: 50, y: 50 } })]
      const interiors = generateAllRuinInteriors(ruins)
      placeRuinEntrances(map, interiors)
      expect(map[50][50].type).toBe(TileType.RuinEntrance)
    })

    it('does not overwrite CaveEntrance tiles', () => {
      const map: Tile[][] = Array.from({ length: 100 }, () =>
        Array.from({ length: 100 }, () => ({ type: TileType.Dirt })),
      )
      map[50][50] = { type: TileType.CaveEntrance }
      const ruins = [makeRuin({ position: { x: 50, y: 50 } })]
      const interiors = generateAllRuinInteriors(ruins)
      placeRuinEntrances(map, interiors)
      expect(map[50][50].type).toBe(TileType.CaveEntrance)
    })
  })

  describe('zone transitions', () => {
    it('enterRuin swaps map to ruin interior', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      if (state.ruinInteriors.length === 0) return
      const interior = state.ruinInteriors[0]
      enterRuin(state, 0)
      expect(state.currentZone).toBe(Zone.Ruin)
      expect(state.currentRuinIndex).toBe(0)
      expect(state.map).toBe(interior.map)
      expect(state.mapWidth).toBe(interior.mapWidth)
      expect(state.mapHeight).toBe(interior.mapHeight)
      expect(interior.explored).toBe(true)
    })

    it('enterRuin clears navigation state', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      if (state.ruinInteriors.length === 0) return
      state.path = [{ x: 1, y: 1 }]
      state.pathWaypoints = [{ x: 2, y: 2 }]
      state.pendingAction = () => undefined
      enterRuin(state, 0)
      expect(state.path).toBeNull()
      expect(state.pathWaypoints).toHaveLength(0)
      expect(state.pendingAction).toBeNull()
    })

    it('exitRuin restores overworld map', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      if (state.ruinInteriors.length === 0) return
      const overworldMap = state.overworldMap
      enterRuin(state, 0)
      exitRuin(state)
      expect(state.currentZone).toBe(Zone.Overworld)
      expect(state.currentRuinIndex).toBeNull()
      expect(state.map).toBe(overworldMap)
    })

    it('exitRuin places player south of entrance', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      if (state.ruinInteriors.length === 0) return
      const entrance = state.ruinInteriors[0].entranceOverworld
      enterRuin(state, 0)
      exitRuin(state)
      expect(state.player.x).toBe(entrance.x)
      expect(state.player.y).toBe(entrance.y + 1)
    })

    it('exitRuin is a no-op when not in a ruin', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const zone = state.currentZone
      const map = state.map
      exitRuin(state)
      expect(state.currentZone).toBe(zone)
      expect(state.map).toBe(map)
    })

    it('checkRuinTransition returns false for non-entrance tiles', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      // Player is on a dirt tile by default
      expect(checkRuinTransition(state)).toBe(false)
    })
  })

  describe('multiple ruins', () => {
    it('can enter different ruins independently', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      if (state.ruinInteriors.length < 2) return
      enterRuin(state, 0)
      const map0 = state.map
      exitRuin(state)
      enterRuin(state, 1)
      expect(state.map).not.toBe(map0)
      expect(state.currentRuinIndex).toBe(1)
    })
  })

  describe('tile type walkability', () => {
    it('RuinFloor is walkable', () => {
      expect(isWalkableTile(TileType.RuinFloor)).toBe(true)
    })

    it('RuinWall is not walkable', () => {
      expect(isWalkableTile(TileType.RuinWall)).toBe(false)
    })

    it('RuinEntrance is walkable', () => {
      expect(isWalkableTile(TileType.RuinEntrance)).toBe(true)
    })
  })

  describe('isInCurrentZone', () => {
    it('matches overworld entities when in overworld', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      expect(isInCurrentZone(state, { zone: Zone.Overworld })).toBe(true)
      expect(isInCurrentZone(state, { zone: Zone.Cave })).toBe(false)
    })

    it('matches ruin entities with correct index', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      if (state.ruinInteriors.length === 0) return
      enterRuin(state, 0)
      expect(isInCurrentZone(state, { zone: Zone.Ruin, ruinIndex: 0 })).toBe(true)
      expect(isInCurrentZone(state, { zone: Zone.Ruin, ruinIndex: 1 })).toBe(false)
      expect(isInCurrentZone(state, { zone: Zone.Overworld })).toBe(false)
    })
  })

  describe('seed and artifact items', () => {
    it('defines wildflower seeds', () => {
      expect(ITEM_DEFINITIONS.wildflowerSeeds).toBeDefined()
      expect(ITEM_DEFINITIONS.wildflowerSeeds.category).toBe('seed')
    })

    it('defines stone tablet artifact', () => {
      expect(ITEM_DEFINITIONS.stoneTablet).toBeDefined()
      expect(ITEM_DEFINITIONS.stoneTablet.category).toBe('artifact')
    })

    it('defines all seed types', () => {
      expect(ITEM_DEFINITIONS.tallGrassSeeds).toBeDefined()
      expect(ITEM_DEFINITIONS.milkweedSeeds).toBeDefined()
    })

    it('defines aqueduct key', () => {
      expect(ITEM_DEFINITIONS.aqueductKey).toBeDefined()
    })
  })

  describe('subsidence', () => {
    const makeSubsidenceRuin = () => {
      const ruin = makeRuin({ radius: 4, age: 3000 })
      let a = 42 | 0
      const rng = () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      return generateRuinInterior(ruin, 0, RuinArchetype.Subsidence, rng)
    }

    it('generates subsidence data for Subsidence archetype', () => {
      const interior = makeSubsidenceRuin()
      expect(interior.subsidence).not.toBeNull()
    })

    it('does not generate subsidence data for other archetypes', () => {
      const ruin = makeRuin()
      let a = 42 | 0
      const rng = () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      const interior = generateRuinInterior(ruin, 0, RuinArchetype.HauntedThreshold, rng)
      expect(interior.subsidence).toBeNull()
    })

    it('places structural integrity on perimeter tiles', () => {
      const interior = makeSubsidenceRuin()
      const sub = interior.subsidence
      expect(sub).toBeTruthy()
      if (!sub) return
      expect(sub.structuralIntegrity.size).toBeGreaterThan(0)
      for (const [, value] of sub.structuralIntegrity) {
        expect(value).toBeGreaterThanOrEqual(5)
        expect(value).toBeLessThanOrEqual(100)
      }
    })

    it('places seed positions inside the hall', () => {
      const interior = makeSubsidenceRuin()
      const sub = interior.subsidence
      expect(sub).toBeTruthy()
      if (!sub) return
      expect(sub.seedPositions.length).toBeGreaterThanOrEqual(4)
      // All seeds should be on walkable tiles
      for (const pos of sub.seedPositions) {
        const tile = interior.map[pos.y][pos.x]
        expect(isWalkableTile(tile.type)).toBe(true)
      }
    })

    it('marks low-integrity tiles as RuinUnstable', () => {
      const interior = makeSubsidenceRuin()
      const sub = interior.subsidence
      expect(sub).toBeTruthy()
      if (!sub) return
      let hasUnstable = false
      for (let y = 0; y < interior.mapHeight; y++) {
        for (let x = 0; x < interior.mapWidth; x++) {
          if (interior.map[y][x].type === TileType.RuinUnstable) {
            hasUnstable = true
            // Unstable tiles should have integrity < 50
            const integrity = sub.structuralIntegrity.get(posKey(x, y))
            if (integrity !== undefined) {
              expect(integrity).toBeLessThan(50)
            }
          }
        }
      }
      expect(hasUnstable).toBe(true)
    })

    it('does not collapse before the minimum first wave time', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      // Find a subsidence ruin
      const subIdx = state.ruinInteriors.findIndex((r) => r.subsidence !== null)
      if (subIdx === -1) return // no subsidence ruins generated with this seed
      enterRuin(state, subIdx)
      const sub = state.ruinInteriors[subIdx].subsidence
      expect(sub).toBeTruthy()
      if (!sub) return

      // Count floor tiles before
      const countFloor = () => {
        let count = 0
        const interior = state.ruinInteriors[subIdx]
        for (let y = 0; y < interior.mapHeight; y++) {
          for (let x = 0; x < interior.mapWidth; x++) {
            const t = interior.map[y][x].type
            if (t === TileType.RuinFloor || t === TileType.RuinUnstable) count++
          }
        }
        return count
      }

      const floorBefore = countFloor()
      // Tick 5 seconds — should not collapse yet (min is 10s)
      for (let i = 0; i < 10; i++) {
        tickSubsidenceCollapse(state, 500)
      }
      const floorAfter = countFloor()
      expect(floorAfter).toBe(floorBefore)
    })

    it('collapses tiles after enough time passes', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const subIdx = state.ruinInteriors.findIndex((r) => r.subsidence !== null)
      if (subIdx === -1) return
      enterRuin(state, subIdx)
      const sub = state.ruinInteriors[subIdx].subsidence
      if (!sub) return

      const countFloor = () => {
        let count = 0
        const interior = state.ruinInteriors[subIdx]
        for (let y = 0; y < interior.mapHeight; y++) {
          for (let x = 0; x < interior.mapWidth; x++) {
            const t = interior.map[y][x].type
            if (t === TileType.RuinFloor || t === TileType.RuinUnstable) count++
          }
        }
        return count
      }

      const floorBefore = countFloor()
      // Tick 30 seconds (60 ticks at 500ms)
      for (let i = 0; i < 60; i++) {
        tickSubsidenceCollapse(state, 500)
      }
      const floorAfter = countFloor()
      expect(floorAfter).toBeLessThan(floorBefore)
    })

    it('displaces player when standing on a collapsing tile', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const subIdx = state.ruinInteriors.findIndex((r) => r.subsidence !== null)
      if (subIdx === -1) return
      enterRuin(state, subIdx)
      const sub = state.ruinInteriors[subIdx].subsidence
      if (!sub) return

      // Place player on a low-integrity tile
      for (const [key, integrity] of sub.structuralIntegrity) {
        if (integrity < 25) {
          const parts = key.split(',')
          state.player.x = Number(parts[0])
          state.player.y = Number(parts[1])
          break
        }
      }

      // Tick enough to trigger collapse of the low-integrity tile
      for (let i = 0; i < 80; i++) {
        tickSubsidenceCollapse(state, 500)
        // Check if player moved or was ejected
        if (state.currentZone !== Zone.Ruin) break
      }
      // Player should have moved or been ejected
      if (state.currentZone === Zone.Ruin) {
        const tile = state.ruinInteriors[subIdx].map[state.player.y]?.[state.player.x]
        expect(tile?.type).not.toBe(TileType.RuinWall)
      }
    })

    it('collapseRate is faster for older ruins', () => {
      const youngRuin = makeRuin({ age: 1000 })
      const oldRuin = makeRuin({ age: 6000 })
      const makeRng = (seed: number) => {
        let a = seed | 0
        return () => {
          a = (a + 0x6d2b79f5) | 0
          let t = Math.imul(a ^ (a >>> 15), 1 | a)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
      }
      const youngInterior = generateRuinInterior(youngRuin, 0, RuinArchetype.Subsidence, makeRng(42))
      const oldInterior = generateRuinInterior(oldRuin, 1, RuinArchetype.Subsidence, makeRng(42))
      expect(youngInterior.subsidence).toBeTruthy()
      expect(oldInterior.subsidence).toBeTruthy()
      if (!youngInterior.subsidence || !oldInterior.subsidence) return
      expect(oldInterior.subsidence.collapseRate).toBeLessThan(youngInterior.subsidence.collapseRate)
    })
  })
})
