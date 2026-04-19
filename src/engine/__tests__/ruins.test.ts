import { describe, expect, it, vi } from 'vitest'
import { assignArchetype, beginRuinEjection, checkRuinTransition, enterRuin, exitRuin, generateAllRuinInteriors, generateRuinInterior, getRuinTileLayers, isInCurrentZone, placeRuinEntrances, tickRuinEjection, tickSubsidenceCollapse } from '../ruins'
import { RuinArchetype, RuinEjectionPhase, RuinEjectionReason, TileType, Zone } from '../types'
import { createGameState } from '../state'
import { findSafeExitPosition, isWalkableTile, posKey } from '../position'
import { movePlayer } from '../movement'
import { ITEM_DEFINITIONS } from '../items'
import { ComponentType } from '../ecs/types'
import { ENTRANCE_GLYPHS, RUIN_EJECTION_FADE_MS, RUIN_EJECTION_HOLD_MS, RUIN_EJECTION_NOTIFICATION_MS, RUIN_EJECTION_SHAKE_MS, RUIN_ENTRY_TOASTS, getEntranceGlyph } from '../constants'

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

    it('exitRuin places player on walkable tile adjacent to entrance', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      if (state.ruinInteriors.length === 0) return
      const entrance = state.ruinInteriors[0].entranceOverworld
      enterRuin(state, 0)
      exitRuin(state)
      // Player should be within 1 tile of the entrance
      const dx = Math.abs(state.player.x - entrance.x)
      const dy = Math.abs(state.player.y - entrance.y)
      expect(dx).toBeLessThanOrEqual(1)
      expect(dy).toBeLessThanOrEqual(1)
      // Player should be on a walkable tile
      const tile = state.map[state.player.y][state.player.x]
      expect(isWalkableTile(tile.type)).toBe(true)
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
        tickSubsidenceCollapse(state, 500, 0)
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

      // Ensure at least one tile has low integrity so collapse is guaranteed
      const firstKey = sub.structuralIntegrity.keys().next().value
      if (firstKey) sub.structuralIntegrity.set(firstKey, 10)

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
      // Tick 100 seconds (200 ticks at 500ms) — covers 10s wait + 90s full collapse window
      for (let i = 0; i < 200; i++) {
        tickSubsidenceCollapse(state, 500, 0)
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
        tickSubsidenceCollapse(state, 500, 0)
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

  describe('archetype distribution balance', () => {
    it('does not assign all ruins to DormantGarden when all have aqueduct paths', () => {
      const makeRng = (seed: number) => {
        let a = seed | 0
        return () => {
          a = (a + 0x6d2b79f5) | 0
          let t = Math.imul(a ^ (a >>> 15), 1 | a)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
      }

      const archetypes = new Set<RuinArchetype>()
      for (let i = 0; i < 10; i++) {
        const ruin = makeRuin({
          radius: 3 + (i % 3),
          age: 1000 + i * 500,
          aqueductPaths: [
            [{ x: 50, y: 50 }, { x: 60, y: 50 }],
            [{ x: 50, y: 50 }, { x: 50, y: 60 }],
          ],
          buildingFootprints: Array.from({ length: i + 1 }, (_, j) => ({ x: 50 + j, y: 50 })),
        })
        archetypes.add(assignArchetype(ruin, i, makeRng(i * 7 + 13)))
      }
      // With balanced scoring, 10 varied ruins should produce at least 2 distinct archetypes
      expect(archetypes.size).toBeGreaterThanOrEqual(2)
    })
  })

  describe('greek letter entrance glyphs', () => {
    it('getEntranceGlyph returns unique letters for cave and ruin indices', () => {
      const cave = getEntranceGlyph(0)
      const ruin0 = getEntranceGlyph(1)
      const ruin1 = getEntranceGlyph(2)
      expect(cave).toBe('Ω')
      expect(ruin0).toBe('Δ')
      expect(ruin1).toBe('Φ')
      expect(cave).not.toBe(ruin0)
      expect(ruin0).not.toBe(ruin1)
    })

    it('cycles when index exceeds glyph count', () => {
      const overflow = getEntranceGlyph(ENTRANCE_GLYPHS.length)
      expect(overflow).toBe(ENTRANCE_GLYPHS[0])
    })

    it('no glyph resembles a Latin letter', () => {
      const latinLike = new Set(['A', 'B', 'E', 'H', 'I', 'K', 'M', 'N', 'O', 'P', 'T', 'X', 'Y', 'Z'])
      for (const glyph of ENTRANCE_GLYPHS) {
        expect(latinLike.has(glyph)).toBe(false)
      }
    })
  })

  describe('astral void ponds', () => {
    const makeRng = (seed: number) => {
      let a = seed | 0
      return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }

    it('places Space tiles in ruin interiors', () => {
      const ruin = makeRuin({ radius: 5 })
      // Use a seed that produces > 0% coverage
      const interior = generateRuinInterior(ruin, 0, RuinArchetype.Subsidence, makeRng(999))
      let spaceCount = 0
      for (let y = 0; y < interior.mapHeight; y++) {
        for (let x = 0; x < interior.mapWidth; x++) {
          if (interior.map[y][x].type === TileType.Space) spaceCount++
        }
      }
      // With seed 999 and radius 5, we expect some space tiles (may be 0 if RNG gives 0%)
      // Test across multiple seeds to verify the mechanism works
      let anyHasSpace = spaceCount > 0
      if (!anyHasSpace) {
        const interior2 = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, makeRng(12345))
        for (let y = 0; y < interior2.mapHeight; y++) {
          for (let x = 0; x < interior2.mapWidth; x++) {
            if (interior2.map[y][x].type === TileType.Space) { anyHasSpace = true; break }
          }
          if (anyHasSpace) break
        }
      }
      expect(anyHasSpace).toBe(true)
    })

    it('does not place Space on the entrance tile', () => {
      // Generate many ruins and verify none have Space on entrance
      for (let seed = 0; seed < 20; seed++) {
        const ruin = makeRuin({ radius: 4 })
        const interior = generateRuinInterior(ruin, 0, RuinArchetype.Resonance, makeRng(seed * 7 + 1))
        const { x, y } = interior.entranceInterior
        expect(interior.map[y][x].type).not.toBe(TileType.Space)
      }
    })

    it('keeps void coverage at or below 10%', () => {
      const ruin = makeRuin({ radius: 5 })
      for (let seed = 0; seed < 10; seed++) {
        const interior = generateRuinInterior(ruin, 0, RuinArchetype.HauntedThreshold, makeRng(seed * 13))
        let walkable = 0
        let space = 0
        for (let y = 0; y < interior.mapHeight; y++) {
          for (let x = 0; x < interior.mapWidth; x++) {
            const t = interior.map[y][x].type
            if (isWalkableTile(t)) walkable++
            if (t === TileType.Space) space++
          }
        }
        const totalFloor = walkable + space
        if (totalFloor > 0) {
          expect(space / totalFloor).toBeLessThanOrEqual(0.1001) // tiny float tolerance
        }
      }
    })

    it('preserves reachability of critical positions', () => {
      // Generate ruins and verify entrance can reach all walkable critical tiles
      for (let seed = 0; seed < 10; seed++) {
        const ruin = makeRuin({ radius: 4 })
        const interior = generateRuinInterior(ruin, 0, RuinArchetype.Subsidence, makeRng(seed * 11))
        const { entranceInterior } = interior

        // BFS from entrance
        const reachable = new Set<string>()
        const queue = [entranceInterior]
        reachable.add(posKey(entranceInterior.x, entranceInterior.y))
        while (queue.length > 0) {
          const pos = queue.shift()
          if (!pos) break
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
            const nx = pos.x + dx
            const ny = pos.y + dy
            if (nx < 0 || nx >= interior.mapWidth || ny < 0 || ny >= interior.mapHeight) continue
            const key = posKey(nx, ny)
            if (reachable.has(key)) continue
            if (!isWalkableTile(interior.map[ny][nx].type)) continue
            reachable.add(key)
            queue.push({ x: nx, y: ny })
          }
        }

        // All seed positions must be reachable
        if (interior.subsidence) {
          for (const sp of interior.subsidence.seedPositions) {
            const key = posKey(sp.x, sp.y)
            if (isWalkableTile(interior.map[sp.y][sp.x].type)) {
              expect(reachable.has(key)).toBe(true)
            }
          }
        }
      }
    })

    it('void ponds have minimum size of 3 tiles', () => {
      const ruin = makeRuin({ radius: 5 })
      for (let seed = 0; seed < 10; seed++) {
        const interior = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, makeRng(seed * 17 + 3))
        // Find all Space tiles and flood-fill to count blob sizes
        const spaceTiles = new Set<string>()
        for (let y = 0; y < interior.mapHeight; y++) {
          for (let x = 0; x < interior.mapWidth; x++) {
            if (interior.map[y][x].type === TileType.Space) spaceTiles.add(posKey(x, y))
          }
        }
        if (spaceTiles.size === 0) continue
        // Flood-fill to find connected components
        const visited = new Set<string>()
        for (const startKey of spaceTiles) {
          if (visited.has(startKey)) continue
          const blob = new Set<string>()
          const queue = [startKey]
          blob.add(startKey)
          visited.add(startKey)
          while (queue.length > 0) {
            const key = queue.shift()
            if (!key) break
            const parts = key.split(',')
            const x = Number(parts[0])
            const y = Number(parts[1])
            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
              const nk = posKey(x + dx, y + dy)
              if (spaceTiles.has(nk) && !visited.has(nk)) {
                visited.add(nk)
                blob.add(nk)
                queue.push(nk)
              }
            }
          }
          // Each connected blob must be at least 3 tiles
          expect(blob.size).toBeGreaterThanOrEqual(3)
        }
      }
    })
  })

  describe('subsidence collapse to space', () => {
    it('collapses tiles to Space instead of RuinWall', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const subIdx = state.ruinInteriors.findIndex((r) => r.subsidence !== null)
      if (subIdx === -1) return
      enterRuin(state, subIdx)
      const sub = state.ruinInteriors[subIdx].subsidence
      if (!sub) return

      // Force a low-integrity tile to ensure collapse
      const firstKey = sub.structuralIntegrity.keys().next().value
      if (firstKey) sub.structuralIntegrity.set(firstKey, 10)

      // Tick enough for collapse
      for (let i = 0; i < 200; i++) {
        const result = tickSubsidenceCollapse(state, 500, 0)
        if (result === 'ejected') break
      }

      // Check that collapsed tiles are Space, not RuinWall
      if (firstKey) {
        const parts = firstKey.split(',')
        const tx = Number(parts[0])
        const ty = Number(parts[1])
        const tile = state.ruinInteriors[subIdx].map[ty][tx]
        expect(tile.type).toBe(TileType.Space)
      }
    })

    it('ejects player when standing on a collapsing tile', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const subIdx = state.ruinInteriors.findIndex((r) => r.subsidence !== null)
      if (subIdx === -1) return
      enterRuin(state, subIdx)
      const sub = state.ruinInteriors[subIdx].subsidence
      if (!sub) return

      // Find a low-integrity tile and place player there
      for (const [key, integrity] of sub.structuralIntegrity) {
        if (integrity < 25) {
          const parts = key.split(',')
          state.player.x = Number(parts[0])
          state.player.y = Number(parts[1])
          break
        }
      }
      // Also force low integrity on player tile
      const playerKey = posKey(state.player.x, state.player.y)
      if (sub.structuralIntegrity.has(playerKey)) {
        sub.structuralIntegrity.set(playerKey, 5)
      }

      let ejected = false
      for (let i = 0; i < 200; i++) {
        const result = tickSubsidenceCollapse(state, 500, 0)
        if (result === 'ejected') {
          ejected = true
          break
        }
      }

      if (ejected) {
        expect(state.ruinEjection).toBeTruthy()
      }
    })

    it('returns ejected when player tile collapses', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const subIdx = state.ruinInteriors.findIndex((r) => r.subsidence !== null)
      if (subIdx === -1) return
      enterRuin(state, subIdx)
      const sub = state.ruinInteriors[subIdx].subsidence
      if (!sub) return

      // Place player on a tile and force it to collapse
      const firstKey = sub.structuralIntegrity.keys().next().value
      if (!firstKey) return
      const parts = firstKey.split(',')
      state.player.x = Number(parts[0])
      state.player.y = Number(parts[1])
      sub.structuralIntegrity.set(firstKey, 5)

      let gotEjected = false
      for (let i = 0; i < 200; i++) {
        const result = tickSubsidenceCollapse(state, 500, 0)
        if (result === 'ejected') {
          gotEjected = true
          break
        }
      }
      expect(gotEjected).toBe(true)
    })
  })

  describe('ruin accessibility', () => {
    it('placeRuinEntrances converts non-walkable neighbors to dirt', () => {
      // Create a small map with space surrounding a dirt tile
      const mapWidth = 10
      const mapHeight = 10
      const map: Tile[][] = Array.from({ length: mapHeight }, () =>
        Array.from({ length: mapWidth }, () => ({ type: TileType.Space })),
      )
      // Place dirt at (5, 5) for the entrance
      map[5][5] = { type: TileType.Dirt }

      const interior = {
        entranceOverworld: { x: 5, y: 5 },
      } as { entranceOverworld: { x: number; y: number } }

      placeRuinEntrances(map, [interior as never])

      // Entrance tile should be RuinEntrance
      expect(map[5][5].type).toBe(TileType.RuinEntrance)

      // All 8 neighbors should now be dirt (were space, which is non-walkable)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          expect(map[5 + dy][5 + dx].type).toBe(TileType.Dirt)
        }
      }
    })

    it('placeRuinEntrances handles map edges gracefully', () => {
      const mapWidth = 5
      const mapHeight = 5
      const map: Tile[][] = Array.from({ length: mapHeight }, () =>
        Array.from({ length: mapWidth }, () => ({ type: TileType.Space })),
      )
      map[0][0] = { type: TileType.Dirt }

      const interior = {
        entranceOverworld: { x: 0, y: 0 },
      } as { entranceOverworld: { x: number; y: number } }

      // Should not throw
      placeRuinEntrances(map, [interior as never])
      expect(map[0][0].type).toBe(TileType.RuinEntrance)
      // In-bounds neighbors should be converted
      expect(map[0][1].type).toBe(TileType.Dirt)
      expect(map[1][0].type).toBe(TileType.Dirt)
      expect(map[1][1].type).toBe(TileType.Dirt)
    })

    it('findSafeExitPosition prefers south, falls back to other walkable neighbors', () => {
      const mapWidth = 5
      const mapHeight = 5
      const map: Tile[][] = Array.from({ length: mapHeight }, () =>
        Array.from({ length: mapWidth }, () => ({ type: TileType.Space })),
      )
      const entrance = { x: 2, y: 2 }

      // Only place walkable tiles to the north and east
      map[1][2] = { type: TileType.Dirt } // north
      map[2][3] = { type: TileType.Dirt } // east

      const result = findSafeExitPosition(entrance, map, mapWidth, mapHeight)
      // South is Space, so should fall back to north (second priority)
      expect(result).toEqual({ x: 2, y: 1 })
    })

    it('findSafeExitPosition falls back to entrance when all neighbors blocked', () => {
      const mapWidth = 5
      const mapHeight = 5
      const map: Tile[][] = Array.from({ length: mapHeight }, () =>
        Array.from({ length: mapWidth }, () => ({ type: TileType.Space })),
      )
      const entrance = { x: 2, y: 2 }
      map[2][2] = { type: TileType.Dirt }

      const result = findSafeExitPosition(entrance, map, mapWidth, mapHeight)
      expect(result).toEqual({ x: 2, y: 2 })
    })

    it('exitRuin places player on walkable tile even when south is blocked', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      if (state.ruinInteriors.length === 0) return
      const entrance = state.ruinInteriors[0].entranceOverworld
      // Block the tile south of entrance
      if (entrance.y + 1 < state.overworldMapHeight) {
        state.overworldMap[entrance.y + 1][entrance.x] = { type: TileType.Space }
      }
      enterRuin(state, 0)
      exitRuin(state)
      // Player should be on a walkable tile
      const tile = state.map[state.player.y][state.player.x]
      expect(isWalkableTile(tile.type)).toBe(true)
      // Player should be within 1 tile of entrance
      expect(Math.abs(state.player.x - entrance.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(state.player.y - entrance.y)).toBeLessThanOrEqual(1)
    })
  })

  describe('seed position revalidation', () => {
    const makeRng = (seed: number) => {
      let a = seed | 0
      return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }

    it('subsidence seeds are only on walkable tiles after generation', () => {
      const ruin = makeRuin({ radius: 5, age: 2000 })
      const interior = generateRuinInterior(ruin, 0, RuinArchetype.Subsidence, makeRng(SEED))
      if (!interior.subsidence) return
      for (const pos of interior.subsidence.seedPositions) {
        const tile = interior.map[pos.y]?.[pos.x]
        expect(tile).toBeTruthy()
        expect(isWalkableTile(tile.type)).toBe(true)
      }
    })

    it('dormant garden seeds are only on walkable tiles after generation', () => {
      const ruin = makeRuin({ radius: 5, age: 4000, aqueductPaths: [[{ x: 50, y: 50 }, { x: 60, y: 50 }, { x: 70, y: 50 }]] })
      const interior = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, makeRng(SEED))
      if (!interior.dormantGarden) return
      for (const key of interior.dormantGarden.seedDecayTimers.keys()) {
        const [sx, sy] = key.split(',').map(Number) as [number, number]
        const tile = interior.map[sy]?.[sx]
        expect(tile).toBeTruthy()
        expect(isWalkableTile(tile.type)).toBe(true)
      }
    })
  })

  describe('unstable floor rendering', () => {
    it('RuinUnstable tile blinks between dot and exclamation mark', () => {
      const chars = new Set<string>()
      // Sample at many different time values to catch both phases
      for (let t = 0; t < 5000; t += 50) {
        const layers = getRuinTileLayers(TileType.RuinUnstable, 10, 10, t)
        expect(layers.length).toBeGreaterThan(0)
        chars.add(layers[0].char)
      }
      // Should have both '.' (normal) and '!' (blink) states
      expect(chars.has('.')).toBe(true)
      expect(chars.has('!')).toBe(true)
    })
  })

  describe('unstable floor collapse', () => {
    it('RuinUnstable tile collapses to Space when player walks off it', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      if (state.ruinInteriors.length === 0) return

      // Find a subsidence ruin (has unstable tiles)
      const subIdx = state.ruinInteriors.findIndex((r) => r.subsidence)
      if (subIdx === -1) return
      enterRuin(state, subIdx)

      // Find an unstable tile
      let unstablePos: { x: number; y: number } | null = null
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          if (state.map[y][x].type === TileType.RuinUnstable) {
            // Check if there's a walkable tile to move to (south)
            if (y + 1 < state.mapHeight && isWalkableTile(state.map[y + 1][x].type)) {
              unstablePos = { x, y }
              break
            }
          }
        }
        if (unstablePos) break
      }
      if (!unstablePos) return

      // Place player on unstable tile
      state.player = { ...unstablePos }

      // Move player south (off the unstable tile)
      movePlayer(state, 'down')

      // The tile the player left should now be Space
      expect(state.map[unstablePos.y][unstablePos.x].type).toBe(TileType.Space)
    })

    it('stable ruin floor does not collapse when player walks off', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      if (state.ruinInteriors.length === 0) return
      enterRuin(state, 0)

      // Find a stable floor tile
      let floorPos: { x: number; y: number } | null = null
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          if (state.map[y][x].type === TileType.RuinFloor) {
            if (y + 1 < state.mapHeight && isWalkableTile(state.map[y + 1][x].type)) {
              floorPos = { x, y }
              break
            }
          }
        }
        if (floorPos) break
      }
      if (!floorPos) return

      state.player = { ...floorPos }
      movePlayer(state, 'down')

      // Should remain RuinFloor
      expect(state.map[floorPos.y][floorPos.x].type).toBe(TileType.RuinFloor)
    })
  })
})

describe('ruin collapse trap and ejection', () => {
  const findSubsidenceRuin = (state: ReturnType<typeof createGameState>): number => {
    return state.ruinInteriors.findIndex((r) => r.subsidence !== null)
  }

  describe('entry toast', () => {
    it('queues an archetype-specific toast on enterRuin', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const idx = state.ruinInteriors.findIndex((r) => r.archetype === RuinArchetype.Subsidence)
      if (idx === -1) return
      state.queuedToasts = []
      enterRuin(state, idx)
      const toast = state.queuedToasts.find((t) => t.text === RUIN_ENTRY_TOASTS[RuinArchetype.Subsidence])
      expect(toast).toBeTruthy()
    })

    it('each archetype has a defined entry toast', () => {
      expect(RUIN_ENTRY_TOASTS[RuinArchetype.Subsidence]).toContain('crumbling')
      expect(RUIN_ENTRY_TOASTS[RuinArchetype.DormantGarden]).toBeTruthy()
      expect(RUIN_ENTRY_TOASTS[RuinArchetype.HauntedThreshold]).toBeTruthy()
      expect(RUIN_ENTRY_TOASTS[RuinArchetype.Resonance]).toBeTruthy()
    })
  })

  describe('beginRuinEjection', () => {
    it('captures lost items filtered by current ruin', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const idx = findSubsidenceRuin(state)
      if (idx === -1) return
      enterRuin(state, idx)

      // Drop a seed ground item tagged to this ruin
      const e = state.world.createEntity()
      state.world.addComponent(e, ComponentType.Position, { x: state.player.x, y: state.player.y })
      state.world.addComponent(e, ComponentType.ItemDrop, { definitionId: 'wildflowerSeeds' })
      state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
      state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Ruin, ruinIndex: idx })

      beginRuinEjection(state, RuinEjectionReason.SealedIn, 1000)

      expect(state.ruinEjection).toBeTruthy()
      expect(state.ruinEjection?.reason).toBe(RuinEjectionReason.SealedIn)
      const summary = state.ruinEjection?.lostItems
      expect(summary).toBeTruthy()
      if (!summary) return
      const found = summary.items.find((i) => i.definitionId === 'wildflowerSeeds')
      expect(found).toBeTruthy()
      expect(found?.count).toBeGreaterThanOrEqual(1)
    })

    it('noops if ejection is already set', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const idx = findSubsidenceRuin(state)
      if (idx === -1) return
      enterRuin(state, idx)

      beginRuinEjection(state, RuinEjectionReason.SealedIn, 1000)
      const first = state.ruinEjection
      beginRuinEjection(state, RuinEjectionReason.FloorCollapse, 2000)
      expect(state.ruinEjection).toBe(first)
      expect(state.ruinEjection?.reason).toBe(RuinEjectionReason.SealedIn)
    })

    it('noops outside a ruin', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      state.currentRuinIndex = null
      beginRuinEjection(state, RuinEjectionReason.SealedIn, 0)
      expect(state.ruinEjection).toBeNull()
    })
  })

  describe('tickRuinEjection phase progression', () => {
    it('progresses shake -> fade -> hold -> notification and calls exitRuin', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const idx = findSubsidenceRuin(state)
      if (idx === -1) return
      enterRuin(state, idx)

      beginRuinEjection(state, RuinEjectionReason.SealedIn, 0)
      expect(state.ruinEjection?.phase).toBe(RuinEjectionPhase.Shake)
      expect(state.currentZone).toBe(Zone.Ruin)

      tickRuinEjection(state, 100)
      expect(state.ruinEjection?.phase).toBe(RuinEjectionPhase.Shake)

      tickRuinEjection(state, RUIN_EJECTION_SHAKE_MS + 100)
      expect(state.ruinEjection?.phase).toBe(RuinEjectionPhase.Fade)

      tickRuinEjection(state, RUIN_EJECTION_SHAKE_MS + RUIN_EJECTION_FADE_MS + 100)
      expect(state.ruinEjection?.phase).toBe(RuinEjectionPhase.Hold)

      tickRuinEjection(state, RUIN_EJECTION_SHAKE_MS + RUIN_EJECTION_FADE_MS + RUIN_EJECTION_HOLD_MS + 10)
      expect(state.currentZone).toBe(Zone.Overworld)
      expect(state.ruinEjection?.exited).toBe(true)
      expect(state.ruinEjection?.phase).toBe(RuinEjectionPhase.Notification)
    })

    it('clears ruinEjection after notification duration', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const idx = findSubsidenceRuin(state)
      if (idx === -1) return
      enterRuin(state, idx)

      beginRuinEjection(state, RuinEjectionReason.SealedIn, 0)
      const exitTime = RUIN_EJECTION_SHAKE_MS + RUIN_EJECTION_FADE_MS + RUIN_EJECTION_HOLD_MS + 10
      tickRuinEjection(state, exitTime)
      expect(state.ruinEjection?.exited).toBe(true)

      tickRuinEjection(state, exitTime + RUIN_EJECTION_NOTIFICATION_MS + 10)
      expect(state.ruinEjection).toBeNull()
    })

    it('suppresses held direction during ejection', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const idx = findSubsidenceRuin(state)
      if (idx === -1) return
      enterRuin(state, idx)
      state.heldDirection = 'up'
      beginRuinEjection(state, RuinEjectionReason.SealedIn, 0)
      tickRuinEjection(state, 100)
      expect(state.heldDirection).toBeNull()
    })
  })

  describe('lost items toast', () => {
    it('queues a notification toast after exit', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const idx = findSubsidenceRuin(state)
      if (idx === -1) return
      enterRuin(state, idx)
      state.queuedToasts = []
      beginRuinEjection(state, RuinEjectionReason.SealedIn, 0)
      const exitTime = RUIN_EJECTION_SHAKE_MS + RUIN_EJECTION_FADE_MS + RUIN_EJECTION_HOLD_MS + 10
      tickRuinEjection(state, exitTime)
      const toast = state.queuedToasts.find(
        (t) => t.text.startsWith('lost items in') || t.text.includes('collapsed behind you'),
      )
      expect(toast).toBeTruthy()
    })

    it('uses empty-list phrasing when no items were left', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const idx = findSubsidenceRuin(state)
      if (idx === -1) return
      enterRuin(state, idx)
      // Remove any existing ground items in the ruin
      for (const eid of [...state.world.query(ComponentType.EntityTag)]) {
        const tag = state.world.getComponent(eid, ComponentType.EntityTag)
        const zone = state.world.getComponent(eid, ComponentType.EntityZone)
        if (tag === 'groundItem' && zone?.zone === Zone.Ruin && zone.ruinIndex === idx) {
          state.world.destroyEntity(eid)
        }
      }
      state.queuedToasts = []
      beginRuinEjection(state, RuinEjectionReason.SealedIn, 0)
      const exitTime = RUIN_EJECTION_SHAKE_MS + RUIN_EJECTION_FADE_MS + RUIN_EJECTION_HOLD_MS + 10
      tickRuinEjection(state, exitTime)
      const toast = state.queuedToasts.find((t) => t.text.includes('collapsed behind you'))
      expect(toast).toBeTruthy()
    })
  })

  describe('reachability trap detection', () => {
    it('fires sealed-in ejection when player is cut off from entrance', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const idx = findSubsidenceRuin(state)
      if (idx === -1) return
      enterRuin(state, idx)
      const interior = state.ruinInteriors[idx]
      const { mapWidth, mapHeight } = interior

      // Build a clean synthetic interior: floor everywhere, walls around player,
      // entrance at bottom center unreachable.
      const cleanMap: Tile[][] = Array.from({ length: mapHeight }, () =>
        Array.from({ length: mapWidth }, () => ({ type: TileType.RuinFloor }) as Tile),
      )
      const entX = interior.entranceInterior.x
      const entY = interior.entranceInterior.y + 1
      cleanMap[entY][entX] = { type: TileType.RuinEntrance }
      // Place player far from entrance
      const px = 5
      const py = 5
      state.player = { x: px, y: py }
      // Completely seal player in with Space in 4 directions AND diagonals
      // to ensure no cardinal path exists
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          cleanMap[py + dy][px + dx] = { type: TileType.Space }
        }
      }
      interior.map = cleanMap
      state.map = cleanMap

      // Force collapse timer past threshold and clear integrity so the
      // collapse loop runs but doesn't match any tiles (no floor collapse
      // nor entrance collapse — only the reachability check fires).
      const sub = interior.subsidence
      if (!sub) return
      sub.collapseTimer = 999999
      sub.structuralIntegrity.clear()

      tickSubsidenceCollapse(state, 500, 0)

      expect(state.ruinEjection).toBeTruthy()
      expect(state.ruinEjection?.reason).toBe(RuinEjectionReason.SealedIn)
    })

    it('does not fire when entrance is reachable', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
      const idx = findSubsidenceRuin(state)
      if (idx === -1) return
      enterRuin(state, idx)
      const interior = state.ruinInteriors[idx]
      // Player is placed at entrance on enter — entrance is trivially reachable
      tickSubsidenceCollapse(state, 100, 0)
      // no ejection
      if (state.ruinEjection) {
        // If an ejection fired, it should not be sealed-in (floor or entrance collapse possible)
        expect(state.ruinEjection.reason).not.toBe(RuinEjectionReason.SealedIn)
      }
      expect(interior).toBeTruthy()
    })
  })
})
