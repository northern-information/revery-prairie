import { CAVE_VISION_RADIUS, OVERWORLD_VISION_RADIUS, RUIN_VISION_RADIUS } from '../constants'
import { posKey } from '../position'
import { TileType, Zone } from '../types'
import { blocksLOS, computeFOV, computeZoneVisibility, dimColor, getTileVisibility, hasFogOfWar } from '../visibility'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it, vi } from 'vitest'

import type { GameState, RuinInterior, Tile } from '../types'

/** Build a simple cave-like map for testing. Defaults to all CaveFloor. */
const makeCaveMap = (width: number, height: number): Tile[][] => {
  const map: Tile[][] = []
  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < width; x++) {
      row.push({ type: TileType.CaveFloor })
    }
    map.push(row)
  }
  return map
}

/** Put a state into cave mode with a custom map. */
const enterCaveWithMap = (state: GameState, map: Tile[][], width: number, height: number): void => {
  state.map = map
  state.mapWidth = width
  state.mapHeight = height
  state.currentZone = Zone.Cave
}

describe('fog of war', () => {
  describe('blocksLOS', () => {
    it('CaveWall blocks line of sight', () => {
      expect(blocksLOS(TileType.CaveWall)).toBe(true)
    })

    it('CaveBreakableWall blocks line of sight', () => {
      expect(blocksLOS(TileType.CaveBreakableWall)).toBe(true)
    })

    it('CaveFloor does not block line of sight', () => {
      expect(blocksLOS(TileType.CaveFloor)).toBe(false)
    })

    it('CaveEntrance does not block line of sight', () => {
      expect(blocksLOS(TileType.CaveEntrance)).toBe(false)
    })
  })

  describe('computeFOV', () => {
    it('origin is always visible', () => {
      const map = makeCaveMap(10, 10)
      const visible = computeFOV(5, 5, 3, map, 10, 10)
      expect(visible.has(posKey(5, 5))).toBe(true)
    })

    it('tiles within radius are visible in open space', () => {
      const map = makeCaveMap(20, 20)
      const visible = computeFOV(10, 10, 3, map, 20, 20)

      // Cardinal neighbors at distance 1-3
      expect(visible.has(posKey(10, 9))).toBe(true) // up 1
      expect(visible.has(posKey(10, 8))).toBe(true) // up 2
      expect(visible.has(posKey(10, 7))).toBe(true) // up 3
      expect(visible.has(posKey(11, 10))).toBe(true) // right 1
      expect(visible.has(posKey(12, 10))).toBe(true) // right 2
      expect(visible.has(posKey(13, 10))).toBe(true) // right 3
    })

    it('tiles beyond radius are not visible', () => {
      const map = makeCaveMap(20, 20)
      const visible = computeFOV(10, 10, 3, map, 20, 20)

      // Cardinal at distance 4
      expect(visible.has(posKey(10, 6))).toBe(false) // up 4
      expect(visible.has(posKey(14, 10))).toBe(false) // right 4
    })

    it('walls block vision behind them', () => {
      const map = makeCaveMap(20, 20)
      // Place a wall 2 tiles to the right of origin
      map[10][12] = { type: TileType.CaveWall }

      const visible = computeFOV(10, 10, 5, map, 20, 20)

      // The wall itself is visible
      expect(visible.has(posKey(12, 10))).toBe(true)
      // Tile behind the wall is not visible
      expect(visible.has(posKey(13, 10))).toBe(false)
    })

    it('walls do not block adjacent corridors', () => {
      const map = makeCaveMap(20, 20)
      // Place a wall blocking direct right path
      map[10][12] = { type: TileType.CaveWall }

      const visible = computeFOV(10, 10, 5, map, 20, 20)

      // Tiles above and below the wall line are still visible
      expect(visible.has(posKey(12, 9))).toBe(true) // above wall
      expect(visible.has(posKey(12, 11))).toBe(true) // below wall
    })

    it('handles out-of-bounds origin gracefully', () => {
      const map = makeCaveMap(5, 5)
      const visible = computeFOV(-1, -1, 3, map, 5, 5)
      // Should not crash, origin out of bounds
      expect(visible.size).toBeGreaterThanOrEqual(0)
    })

    it('narrow corridor limits vision around corners', () => {
      // Create a 1-tile-wide L-shaped corridor
      const map = makeCaveMap(15, 15)
      // Fill everything with walls
      for (let y = 0; y < 15; y++) {
        for (let x = 0; x < 15; x++) {
          map[y][x] = { type: TileType.CaveWall }
        }
      }
      // Carve L-shape: horizontal from (1,5) to (7,5), then down from (7,5) to (7,12)
      for (let x = 1; x <= 7; x++) map[5][x] = { type: TileType.CaveFloor }
      for (let y = 5; y <= 12; y++) map[y][7] = { type: TileType.CaveFloor }

      const visible = computeFOV(2, 5, CAVE_VISION_RADIUS, map, 15, 15)

      // Player at (2,5) can see along the horizontal corridor within radius
      expect(visible.has(posKey(3, 5))).toBe(true)
      expect(visible.has(posKey(4, 5))).toBe(true)
      expect(visible.has(posKey(5, 5))).toBe(true)

      // Far end of the vertical corridor is not visible (around the corner and beyond radius)
      expect(visible.has(posKey(7, 10))).toBe(false)
      expect(visible.has(posKey(7, 12))).toBe(false)
    })
  })

  describe('getTileVisibility', () => {
    it('returns unexplored for overworld tiles outside the visible/explored sets (precis #38)', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        state.currentZone = Zone.Overworld
        const result = getTileVisibility(state, 5, 5, new Set())
        expect(result).toBe('unexplored')
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('returns visible when tile is in visible set', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        state.currentZone = Zone.Cave
        const visibleSet = new Set([posKey(5, 5)])
        expect(getTileVisibility(state, 5, 5, visibleSet)).toBe('visible')
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('returns partiallyDiscovered when tile is in explored set but not in discovered set or visible', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        state.currentZone = Zone.Cave
        state.caveFogExplored.add(posKey(5, 5))
        expect(getTileVisibility(state, 5, 5, new Set())).toBe('partiallyDiscovered')
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('returns unexplored when tile is neither visible nor explored', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        state.currentZone = Zone.Cave
        expect(getTileVisibility(state, 5, 5, new Set())).toBe('unexplored')
      } finally {
        vi.restoreAllMocks()
      }
    })
  })

  describe('computeZoneVisibility', () => {
    it('computes visibility around player in cave', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const map = makeCaveMap(20, 20)
        enterCaveWithMap(state, map, 20, 20)
        state.player = { x: 10, y: 10 }
        state.caveEntranceInterior = { x: 10, y: 19 }

        const visible = computeZoneVisibility(state)

        // Player tile is visible
        expect(visible.has(posKey(10, 10))).toBe(true)
        // Tiles within radius
        expect(visible.has(posKey(11, 10))).toBe(true)
        expect(visible.has(posKey(10, 11))).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('includes cave entrance in visible set', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const map = makeCaveMap(20, 20)
        enterCaveWithMap(state, map, 20, 20)
        state.player = { x: 5, y: 5 }
        state.caveEntranceInterior = { x: 15, y: 15 }

        const visible = computeZoneVisibility(state)

        // Entrance is always visible even though it's far from the player
        expect(visible.has(posKey(15, 15))).toBe(true)
        // Entrance neighbors too
        expect(visible.has(posKey(14, 15))).toBe(true)
        expect(visible.has(posKey(16, 15))).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('adds newly visible tiles to caveFogExplored', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const map = makeCaveMap(20, 20)
        enterCaveWithMap(state, map, 20, 20)
        state.player = { x: 10, y: 10 }
        state.caveEntranceInterior = { x: 10, y: 19 }

        expect(state.caveFogExplored.size).toBe(0)
        computeZoneVisibility(state)
        expect(state.caveFogExplored.size).toBeGreaterThan(0)
        expect(state.caveFogExplored.has(posKey(10, 10))).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('promotes tiles within DISCOVERY_RADIUS to caveFogDiscovered (player position + adjacent)', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const map = makeCaveMap(20, 20)
        enterCaveWithMap(state, map, 20, 20)
        state.player = { x: 10, y: 10 }
        state.caveEntranceInterior = { x: 10, y: 19 }

        expect(state.caveFogDiscovered.size).toBe(0)
        computeZoneVisibility(state)

        // Player tile + all 8 neighbors at distance 1 + ring at distance 2
        // = at minimum 9 tiles (3x3); with DISCOVERY_RADIUS=2 it's 5x5 = 25 tiles
        expect(state.caveFogDiscovered.has(posKey(10, 10))).toBe(true)
        expect(state.caveFogDiscovered.has(posKey(11, 10))).toBe(true)
        expect(state.caveFogDiscovered.has(posKey(12, 10))).toBe(true)
        expect(state.caveFogDiscovered.has(posKey(8, 8))).toBe(true) // diagonal at 2
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('does NOT promote tiles beyond DISCOVERY_RADIUS even if visible', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const map = makeCaveMap(20, 20)
        enterCaveWithMap(state, map, 20, 20)
        state.player = { x: 10, y: 10 }
        state.caveEntranceInterior = { x: 10, y: 19 }

        computeZoneVisibility(state)

        // Tile at distance 3 (within vision radius 3, beyond DISCOVERY_RADIUS=2)
        expect(state.caveFogExplored.has(posKey(13, 10))).toBe(true)
        expect(state.caveFogDiscovered.has(posKey(13, 10))).toBe(false)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('does NOT promote tiles within DISCOVERY_RADIUS that are blocked by a wall (no LOS)', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const map = makeCaveMap(20, 20)
        // Wall between player (10,10) and (12,10)
        map[10][11] = { type: TileType.CaveWall }
        enterCaveWithMap(state, map, 20, 20)
        state.player = { x: 10, y: 10 }
        state.caveEntranceInterior = { x: 10, y: 19 }

        computeZoneVisibility(state)

        // Tile at (12,10) is within DISCOVERY_RADIUS (Chebyshev distance 2)
        // but has no LOS — it must NOT be promoted
        expect(state.caveFogDiscovered.has(posKey(12, 10))).toBe(false)
        // The wall itself is in LOS at distance 1, so it IS promoted
        expect(state.caveFogDiscovered.has(posKey(11, 10))).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('fullyDiscovered state persists after the player moves away (out of LOS)', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const map = makeCaveMap(20, 20)
        enterCaveWithMap(state, map, 20, 20)
        state.player = { x: 5, y: 5 }
        state.caveEntranceInterior = { x: 5, y: 19 }

        computeZoneVisibility(state)
        expect(state.caveFogDiscovered.has(posKey(5, 5))).toBe(true)

        // Move the player far away
        state.player = { x: 15, y: 15 }
        const visible = computeZoneVisibility(state)

        // (5,5) is no longer in LOS, but it's still fullyDiscovered
        expect(visible.has(posKey(5, 5))).toBe(false)
        expect(getTileVisibility(state, 5, 5, visible)).toBe('fullyDiscovered')
      } finally {
        vi.restoreAllMocks()
      }
    })

  })

  describe('fog persists across cave visits', () => {
    it('caveFogExplored survives exit and re-entry', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const map = makeCaveMap(20, 20)
        enterCaveWithMap(state, map, 20, 20)
        state.player = { x: 10, y: 10 }
        state.caveEntranceInterior = { x: 10, y: 19 }

        computeZoneVisibility(state)
        const exploredBefore = new Set(state.caveFogExplored)
        expect(exploredBefore.size).toBeGreaterThan(0)

        // Simulate exiting cave
        state.currentZone = Zone.Overworld

        // Re-enter cave
        state.currentZone = Zone.Cave
        state.map = map
        state.mapWidth = 20
        state.mapHeight = 20

        // Explored set persists
        expect(state.caveFogExplored).toEqual(exploredBefore)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('caveFogDiscovered survives exit and re-entry', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const map = makeCaveMap(20, 20)
        enterCaveWithMap(state, map, 20, 20)
        state.player = { x: 10, y: 10 }
        state.caveEntranceInterior = { x: 10, y: 19 }

        computeZoneVisibility(state)
        const discoveredBefore = new Set(state.caveFogDiscovered)
        expect(discoveredBefore.size).toBeGreaterThan(0)

        state.currentZone = Zone.Overworld
        state.currentZone = Zone.Cave
        state.map = map
        state.mapWidth = 20
        state.mapHeight = 20

        expect(state.caveFogDiscovered).toEqual(discoveredBefore)
      } finally {
        vi.restoreAllMocks()
      }
    })
  })

  describe('dimColor', () => {
    it('dims white to gray at 40% brightness', () => {
      const result = dimColor('#ffffff', 0.4)
      expect(result).toBe('#666666')
    })

    it('returns black for 0 brightness', () => {
      const result = dimColor('#ffffff', 0)
      expect(result).toBe('#000000')
    })

    it('returns original for 1.0 brightness', () => {
      const result = dimColor('#ff8800', 1.0)
      expect(result).toBe('#ff8800')
    })
  })

  describe('vision radius', () => {
    it('CAVE_VISION_RADIUS is 6', () => {
      expect(CAVE_VISION_RADIUS).toBe(6)
    })

    it('RUIN_VISION_RADIUS is 6', () => {
      expect(RUIN_VISION_RADIUS).toBe(6)
    })
  })

  describe('hasFogOfWar', () => {
    it('returns true for Cave', () => {
      expect(hasFogOfWar(Zone.Cave)).toBe(true)
    })

    it('returns true for Ruin', () => {
      expect(hasFogOfWar(Zone.Ruin)).toBe(true)
    })

    it('returns true for Overworld (precis #38)', () => {
      expect(hasFogOfWar(Zone.Overworld)).toBe(true)
    })
  })

  describe('blocksLOS — ruin walls', () => {
    it('RuinWall blocks line of sight', () => {
      expect(blocksLOS(TileType.RuinWall)).toBe(true)
    })

    it('RuinFloor does not block line of sight', () => {
      expect(blocksLOS(TileType.RuinFloor)).toBe(false)
    })

    it('RuinEntrance does not block line of sight', () => {
      expect(blocksLOS(TileType.RuinEntrance)).toBe(false)
    })
  })

  describe('ruin fog of war', () => {
    /** Build a simple ruin-like map. Defaults to all RuinFloor. */
    const makeRuinMap = (width: number, height: number): Tile[][] => {
      const map: Tile[][] = []
      for (let y = 0; y < height; y++) {
        const row: Tile[] = []
        for (let x = 0; x < width; x++) {
          row.push({ type: TileType.RuinFloor })
        }
        map.push(row)
      }
      return map
    }

    /** Create a minimal RuinInterior for testing. */
    const makeRuinInterior = (
      ruinIndex: number,
      mapWidth: number,
      mapHeight: number,
      entranceInterior: { x: number; y: number }
    ): RuinInterior => ({
      ruinIndex,
      archetype: 'dormantGarden',
      name: `Test Ruin ${String(ruinIndex)}`,
      map: makeRuinMap(mapWidth, mapHeight),
      mapWidth,
      mapHeight,
      entranceOverworld: { x: 50, y: 50 },
      entranceInterior,
      explored: false,
      cleared: false,
      dormantGarden: null,
      fogExplored: new Set<string>(),
      fogDiscovered: new Set<string>(),
    })

    /** Put a state into ruin mode with a specific ruin interior. */
    const enterRuinWithInterior = (state: GameState, interior: RuinInterior): void => {
      state.ruinInteriors[interior.ruinIndex] = interior
      state.currentRuinIndex = interior.ruinIndex
      state.currentZone = Zone.Ruin
      state.map = interior.map
      state.mapWidth = interior.mapWidth
      state.mapHeight = interior.mapHeight
    }

    it('computes visibility around player in ruin', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const interior = makeRuinInterior(0, 20, 20, { x: 10, y: 19 })
        enterRuinWithInterior(state, interior)
        state.player = { x: 10, y: 10 }

        const visible = computeZoneVisibility(state)

        expect(visible.has(posKey(10, 10))).toBe(true)
        expect(visible.has(posKey(11, 10))).toBe(true)
        expect(visible.has(posKey(10, 11))).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('RuinWall blocks vision in FOV computation', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const interior = makeRuinInterior(0, 20, 20, { x: 10, y: 19 })
        // Place a RuinWall 2 tiles to the right
        interior.map[10][12] = { type: TileType.RuinWall }
        enterRuinWithInterior(state, interior)
        state.player = { x: 10, y: 10 }

        const visible = computeZoneVisibility(state)

        // Wall itself is visible
        expect(visible.has(posKey(12, 10))).toBe(true)
        // Behind wall is not
        expect(visible.has(posKey(13, 10))).toBe(false)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('ruin entrance is always visible', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const interior = makeRuinInterior(0, 20, 20, { x: 15, y: 15 })
        enterRuinWithInterior(state, interior)
        state.player = { x: 5, y: 5 }

        const visible = computeZoneVisibility(state)

        // Entrance and neighbors are always visible
        expect(visible.has(posKey(15, 15))).toBe(true)
        expect(visible.has(posKey(14, 15))).toBe(true)
        expect(visible.has(posKey(16, 15))).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('adds newly visible tiles to ruin fogExplored', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const interior = makeRuinInterior(0, 20, 20, { x: 10, y: 19 })
        enterRuinWithInterior(state, interior)
        state.player = { x: 10, y: 10 }

        expect(interior.fogExplored.size).toBe(0)
        computeZoneVisibility(state)
        expect(interior.fogExplored.size).toBeGreaterThan(0)
        expect(interior.fogExplored.has(posKey(10, 10))).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('getTileVisibility works for ruin zone', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const interior = makeRuinInterior(0, 20, 20, { x: 10, y: 19 })
        enterRuinWithInterior(state, interior)

        // Tile in visible set → visible
        const visibleSet = new Set([posKey(5, 5)])
        expect(getTileVisibility(state, 5, 5, visibleSet)).toBe('visible')

        // Tile in fogExplored but not in fogDiscovered or visible → partiallyDiscovered
        interior.fogExplored.add(posKey(7, 7))
        expect(getTileVisibility(state, 7, 7, new Set())).toBe('partiallyDiscovered')

        // Tile in fogDiscovered but not visible → fullyDiscovered (wins over partiallyDiscovered)
        interior.fogExplored.add(posKey(8, 8))
        interior.fogDiscovered.add(posKey(8, 8))
        expect(getTileVisibility(state, 8, 8, new Set())).toBe('fullyDiscovered')

        // Tile not in either → unexplored
        expect(getTileVisibility(state, 3, 3, new Set())).toBe('unexplored')
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('per-ruin fog state is independent across ruins', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const interior0 = makeRuinInterior(0, 20, 20, { x: 10, y: 19 })
        const interior1 = makeRuinInterior(1, 20, 20, { x: 10, y: 19 })

        // Visit ruin 0
        enterRuinWithInterior(state, interior0)
        state.player = { x: 10, y: 10 }
        computeZoneVisibility(state)
        const explored0 = interior0.fogExplored.size

        // Visit ruin 1
        enterRuinWithInterior(state, interior1)
        state.player = { x: 5, y: 5 }
        computeZoneVisibility(state)

        // Each ruin has independent explored state
        expect(interior0.fogExplored.size).toBe(explored0)
        expect(interior1.fogExplored.size).toBeGreaterThan(0)
        // They explore different positions
        expect(interior1.fogExplored.has(posKey(5, 5))).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('ruin fogExplored persists across visits', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const interior = makeRuinInterior(0, 20, 20, { x: 10, y: 19 })
        enterRuinWithInterior(state, interior)
        state.player = { x: 10, y: 10 }
        computeZoneVisibility(state)
        const exploredBefore = new Set(interior.fogExplored)
        expect(exploredBefore.size).toBeGreaterThan(0)

        // Leave ruin
        state.currentZone = Zone.Overworld
        state.currentRuinIndex = null

        // Re-enter
        enterRuinWithInterior(state, interior)

        expect(interior.fogExplored).toEqual(exploredBefore)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('promotes tiles within DISCOVERY_RADIUS to ruin fogDiscovered', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const interior = makeRuinInterior(0, 20, 20, { x: 10, y: 19 })
        enterRuinWithInterior(state, interior)
        state.player = { x: 10, y: 10 }

        expect(interior.fogDiscovered.size).toBe(0)
        computeZoneVisibility(state)

        expect(interior.fogDiscovered.has(posKey(10, 10))).toBe(true)
        expect(interior.fogDiscovered.has(posKey(11, 10))).toBe(true)
        // Distance 3 (within vision radius, beyond DISCOVERY_RADIUS=2) is NOT promoted
        expect(interior.fogExplored.has(posKey(13, 10))).toBe(true)
        expect(interior.fogDiscovered.has(posKey(13, 10))).toBe(false)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('per-ruin fogDiscovered is independent across ruins', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const interior0 = makeRuinInterior(0, 20, 20, { x: 10, y: 19 })
        const interior1 = makeRuinInterior(1, 20, 20, { x: 10, y: 19 })

        enterRuinWithInterior(state, interior0)
        state.player = { x: 10, y: 10 }
        computeZoneVisibility(state)
        const discovered0 = interior0.fogDiscovered.size
        expect(discovered0).toBeGreaterThan(0)

        enterRuinWithInterior(state, interior1)
        state.player = { x: 5, y: 5 }
        computeZoneVisibility(state)

        expect(interior0.fogDiscovered.size).toBe(discovered0)
        expect(interior1.fogDiscovered.has(posKey(5, 5))).toBe(true)
        expect(interior1.fogDiscovered.has(posKey(10, 10))).toBe(false)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('ruin fogDiscovered persists across visits', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const interior = makeRuinInterior(0, 20, 20, { x: 10, y: 19 })
        enterRuinWithInterior(state, interior)
        state.player = { x: 10, y: 10 }
        computeZoneVisibility(state)
        const discoveredBefore = new Set(interior.fogDiscovered)
        expect(discoveredBefore.size).toBeGreaterThan(0)

        state.currentZone = Zone.Overworld
        state.currentRuinIndex = null
        enterRuinWithInterior(state, interior)

        expect(interior.fogDiscovered).toEqual(discoveredBefore)
      } finally {
        vi.restoreAllMocks()
      }
    })

  })

  describe('overworld fog of war (precis #38)', () => {
    /**
     * Put the player onto a small cleared overworld pocket so vision tests
     * have predictable terrain underneath. `createTestState` already returns
     * a state in `Zone.Overworld`; we only need to clear a few tiles around
     * the player and reset the fog sets so the test starts unseen.
     */
    const prepPrairie = (state: GameState): void => {
      state.currentZone = Zone.Overworld
      clearAroundPlayer(state, 5)
      state.overworldFogExplored.clear()
      state.overworldFogDiscovered.clear()
    }

    it('hasFogOfWar(Zone.Overworld) is true', () => {
      expect(hasFogOfWar(Zone.Overworld)).toBe(true)
    })

    it('OVERWORLD_VISION_RADIUS matches the cave and ruin radii (same eyes, indoors or out)', () => {
      expect(OVERWORLD_VISION_RADIUS).toBe(6)
      expect(OVERWORLD_VISION_RADIUS).toBe(CAVE_VISION_RADIUS)
      expect(OVERWORLD_VISION_RADIUS).toBe(RUIN_VISION_RADIUS)
    })

    it('createGameState initializes overworldFog* to empty sets (fresh tenure)', () => {
      const state = createTestState()
      expect(state.overworldFogExplored).toBeInstanceOf(Set)
      expect(state.overworldFogDiscovered).toBeInstanceOf(Set)
      expect(state.overworldFogExplored.size).toBe(0)
      expect(state.overworldFogDiscovered.size).toBe(0)
    })

    it('computeZoneVisibility lights the player FOV on the prairie', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        prepPrairie(state)
        const visible = computeZoneVisibility(state)
        expect(visible.has(posKey(state.player.x, state.player.y))).toBe(true)
        expect(visible.has(posKey(state.player.x + 1, state.player.y))).toBe(true)
        expect(visible.has(posKey(state.player.x, state.player.y + 1))).toBe(true)
        // Beyond OVERWORLD_VISION_RADIUS in open terrain is not visible
        expect(visible.has(posKey(state.player.x + 10, state.player.y))).toBe(false)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('does NOT force any entrance tile into the visible set on the prairie', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        prepPrairie(state)
        const visible = computeZoneVisibility(state)
        // caveEntranceOverworld is a fixed map position outside the player FOV
        // in a fresh test state. It must NOT be force-added like the cave entrance is.
        const ent = state.caveEntranceOverworld
        const dx = ent.x - state.player.x
        const dy = ent.y - state.player.y
        const cheb = Math.max(Math.abs(dx), Math.abs(dy))
        if (cheb > OVERWORLD_VISION_RADIUS) {
          expect(visible.has(posKey(ent.x, ent.y))).toBe(false)
        }
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('adds newly visible prairie tiles to overworldFogExplored', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        prepPrairie(state)
        computeZoneVisibility(state)
        expect(state.overworldFogExplored.has(posKey(state.player.x, state.player.y))).toBe(true)
        expect(state.overworldFogExplored.size).toBeGreaterThan(0)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('promotes tiles within DISCOVERY_RADIUS of the player to overworldFogDiscovered', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        prepPrairie(state)
        computeZoneVisibility(state)
        // player tile and a Chebyshev-1 neighbor are within DISCOVERY_RADIUS=2 and in LOS
        expect(state.overworldFogDiscovered.has(posKey(state.player.x, state.player.y))).toBe(true)
        expect(state.overworldFogDiscovered.has(posKey(state.player.x + 1, state.player.y))).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('does NOT promote tiles beyond DISCOVERY_RADIUS even if visible', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        prepPrairie(state)
        computeZoneVisibility(state)
        // OVERWORLD_VISION_RADIUS=3 > DISCOVERY_RADIUS=2; a tile at distance 3
        // is visible (when in LOS) but must NOT be in the discovered set.
        const tx = state.player.x + 3
        const ty = state.player.y
        const tileKey = posKey(tx, ty)
        // First check it's actually visible (open terrain after clearAroundPlayer)
        const visible = computeZoneVisibility(state)
        if (visible.has(tileKey)) {
          expect(state.overworldFogDiscovered.has(tileKey)).toBe(false)
        }
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('getTileVisibility returns unexplored for prairie tiles outside the visible/explored sets', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        prepPrairie(state)
        const visible = computeZoneVisibility(state)
        // Pick a tile far away (and not in visible or explored)
        const tx = state.player.x + 20
        const ty = state.player.y + 20
        expect(visible.has(posKey(tx, ty))).toBe(false)
        expect(getTileVisibility(state, tx, ty, visible)).toBe('unexplored')
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('fullyDiscovered prairie tiles remain fullyDiscovered after the player moves away (memory persists)', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        prepPrairie(state)
        // First frame: stand still, promote the spot.
        computeZoneVisibility(state)
        const playerTile = posKey(state.player.x, state.player.y)
        expect(state.overworldFogDiscovered.has(playerTile)).toBe(true)

        // Walk far enough away that the original tile is out of LOS.
        clearAroundPlayer(state, 8)
        state.player = { x: state.player.x + 10, y: state.player.y }
        const visibleAfter = computeZoneVisibility(state)
        expect(visibleAfter.has(playerTile)).toBe(false)
        expect(state.overworldFogDiscovered.has(playerTile)).toBe(true)
        expect(getTileVisibility(state, ...playerTile.split(',').map(Number) as [number, number], visibleAfter)).toBe('fullyDiscovered')
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('overworldFog* survive zone transitions (cave round-trip preserves prairie memory)', () => {
      const state = createTestState()
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        prepPrairie(state)
        computeZoneVisibility(state)
        const exploredBefore = new Set(state.overworldFogExplored)
        const discoveredBefore = new Set(state.overworldFogDiscovered)
        expect(exploredBefore.size).toBeGreaterThan(0)
        expect(discoveredBefore.size).toBeGreaterThan(0)

        // Simulate entering and leaving the cave. We do not call computeZoneVisibility
        // for the cave round-trip because that would mutate cave fog state we don't
        // care about here.
        state.currentZone = Zone.Cave
        state.currentZone = Zone.Overworld

        expect(state.overworldFogExplored).toEqual(exploredBefore)
        expect(state.overworldFogDiscovered).toEqual(discoveredBefore)
      } finally {
        vi.restoreAllMocks()
      }
    })
  })
})
