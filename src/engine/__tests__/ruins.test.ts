import { describe, expect, it, vi } from 'vitest'
import { assignArchetype, checkRuinTransition, enterRuin, exitRuin, generateAllRuinInteriors, generateRuinInterior, getEntranceHaloCells, isInCurrentZone, placeRuinEntrances } from '../ruins'
import { RuinArchetype, TileType, Zone } from '../types'
import { createGameState } from '../state'
import { findSafeExitPosition, isWalkableTile, posKey } from '../position'
import { ITEM_DEFINITIONS } from '../items'
import { ENTRANCE_GLYPHS, RUIN_ENTRANCE_HALO_COLOR, TILE_COLORS, getEntranceGlyph } from '../constants'

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
      const interior = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, rng)
      expect(interior.mapWidth).toBe(4 * 24 + 30)
      expect(interior.mapHeight).toBe(4 * 18 + 24)
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
      const interior = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, rng)
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
      const interior = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, rng)
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

    it('void pond placement does not crash and respects walls', () => {
      // The aqueduct corridor layout intentionally has narrow passages, so
      // most seeds produce no surviving void ponds (the reachability check
      // rejects them). What we verify here is that generation completes
      // cleanly and never replaces walls or the entrance.
      const ruin = makeRuin({ radius: 5 })
      for (let seed = 0; seed < 5; seed++) {
        const interior = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, makeRng(seed * 17 + 3))
        // Walls remain walls
        const cornerTile = interior.map[0][0]
        expect(cornerTile.type).toBe(TileType.RuinWall)
        // Entrance remains entrance
        const ex = Math.floor(interior.mapWidth / 2)
        const ey = interior.mapHeight - 2
        expect(interior.map[ey][ex].type).toBe(TileType.RuinEntrance)
      }
    })

    it('does not place Space on the entrance tile', () => {
      // Generate many ruins and verify none have Space on entrance
      for (let seed = 0; seed < 20; seed++) {
        const ruin = makeRuin({ radius: 4 })
        const interior = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, makeRng(seed * 7 + 1))
        const { x, y } = interior.entranceInterior
        expect(interior.map[y][x].type).not.toBe(TileType.Space)
      }
    })

    it('keeps void coverage at or below 10%', () => {
      const ruin = makeRuin({ radius: 5 })
      for (let seed = 0; seed < 10; seed++) {
        const interior = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, makeRng(seed * 13))
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
        const interior = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, makeRng(seed * 11))
        const { entranceInterior } = interior

        // BFS from entrance — treat locked doors as walkable so the test
        // verifies the post-unlock reachability shape (seeds live inside
        // the vault, gated by the door, but should not be sealed off by
        // void ponds or generator bugs).
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
            const tt = interior.map[ny][nx].type
            const passable = isWalkableTile(tt) || tt === TileType.RuinDoorLocked
            if (!passable) continue
            reachable.add(key)
            queue.push({ x: nx, y: ny })
          }
        }

        // All seed positions must be reachable (assuming the door can be unlocked)
        if (interior.dormantGarden) {
          for (const key of interior.dormantGarden.seedDecayTimers.keys()) {
            const [sxStr, syStr] = key.split(',')
            const sx = Number(sxStr)
            const sy = Number(syStr)
            if (isWalkableTile(interior.map[sy][sx].type)) {
              expect(reachable.has(posKey(sx, sy))).toBe(true)
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

  describe('overworld entrance halo', () => {
    const buildMap = (w: number, h: number, fill: TileType = TileType.Dirt): Tile[][] =>
      Array.from({ length: h }, () => Array.from({ length: w }, () => ({ type: fill })))

    it('RuinEntrance color is verdigris and halo color is deep umber', () => {
      expect(TILE_COLORS[TileType.RuinEntrance]).toBe('#5FD3BC')
      expect(RUIN_ENTRANCE_HALO_COLOR).toBe('#2E1F12')
    })

    it('returns the full 3x3 footprint for an entrance away from edges', () => {
      const map = buildMap(10, 10)
      const cells = getEntranceHaloCells(map, 10, 10, 5, 5)
      expect(cells).toHaveLength(9)
      const keys = new Set(cells.map((c) => `${String(c.x)},${String(c.y)}`))
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          expect(keys.has(`${String(5 + dx)},${String(5 + dy)}`)).toBe(true)
        }
      }
    })

    it('clips cells that fall outside map bounds', () => {
      const map = buildMap(5, 5)
      // Top-left corner: only the SE quadrant of the 3x3 is inside bounds
      const cells = getEntranceHaloCells(map, 5, 5, 0, 0)
      expect(cells).toHaveLength(4)
      const keys = new Set(cells.map((c) => `${String(c.x)},${String(c.y)}`))
      expect(keys).toEqual(new Set(['0,0', '1,0', '0,1', '1,1']))
    })

    it('skips Space tiles inside the 3x3 footprint', () => {
      const map = buildMap(5, 5)
      // Border the entrance with space on the north row
      map[0][1] = { type: TileType.Space }
      map[0][2] = { type: TileType.Space }
      map[0][3] = { type: TileType.Space }
      const cells = getEntranceHaloCells(map, 5, 5, 2, 1)
      const keys = new Set(cells.map((c) => `${String(c.x)},${String(c.y)}`))
      // 6 in-bounds non-space cells (the 3 north tiles are skipped)
      expect(cells).toHaveLength(6)
      expect(keys.has('1,0')).toBe(false)
      expect(keys.has('2,0')).toBe(false)
      expect(keys.has('3,0')).toBe(false)
      expect(keys.has('1,1')).toBe(true)
      expect(keys.has('2,1')).toBe(true)
      expect(keys.has('3,1')).toBe(true)
    })

    it('handles overlapping entrances by returning each halo independently (idempotent in render)', () => {
      const map = buildMap(10, 10)
      // Two entrances 2 tiles apart — their 3x3 halos overlap on a single column
      const a = getEntranceHaloCells(map, 10, 10, 4, 5)
      const b = getEntranceHaloCells(map, 10, 10, 6, 5)
      expect(a).toHaveLength(9)
      expect(b).toHaveLength(9)
      const aKeys = new Set(a.map((c) => `${String(c.x)},${String(c.y)}`))
      const bKeys = new Set(b.map((c) => `${String(c.x)},${String(c.y)}`))
      // Overlap column at x=5
      expect(aKeys.has('5,4')).toBe(true)
      expect(aKeys.has('5,5')).toBe(true)
      expect(aKeys.has('5,6')).toBe(true)
      expect(bKeys.has('5,4')).toBe(true)
      expect(bKeys.has('5,5')).toBe(true)
      expect(bKeys.has('5,6')).toBe(true)
    })

    it('returns no cells when the entrance sits in a fully-Space region', () => {
      const map = buildMap(5, 5, TileType.Space)
      const cells = getEntranceHaloCells(map, 5, 5, 2, 2)
      expect(cells).toHaveLength(0)
    })
  })
})

