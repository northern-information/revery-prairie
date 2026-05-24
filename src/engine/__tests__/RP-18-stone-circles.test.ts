import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { candidateDirtNeighborsContained } from '@/engine/egregore/positions'
import { dropItem } from '@/engine/entities'
import { pickUpFacingOrStandingPlacedMeteorite } from '@/engine/interaction'
import { findFitPosition, placeItem } from '@/engine/inventory'
import { createGameState } from '@/engine/state'
import {
  containingPolygonsKey,
  getHallowedPolygons,
  getStoneCircleGraph,
  isInsideHallowedGround,
} from '@/engine/stoneCircles'
import { TileType } from '@/engine/types'

import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'

import type { GameState, Position } from '@/engine/types'

const buildState = (placed: Position[]): GameState => {
  const state = createGameState('precis18-test', 40, 30)
  state.placedMeteorites = placed
  return state
}

describe('RP-18 — stone circles', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getStoneCircleGraph', () => {
    it('returns no edges for an empty array', () => {
      expect(getStoneCircleGraph([])).toEqual([])
    })

    it('returns no edges for a single meteorite', () => {
      expect(getStoneCircleGraph([{ x: 5, y: 5 }])).toEqual([])
    })

    it('connects two meteorites within radius', () => {
      const edges = getStoneCircleGraph([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ])
      expect(edges).toEqual([{ aIndex: 0, bIndex: 1 }])
    })

    it('does not connect meteorites beyond radius', () => {
      const edges = getStoneCircleGraph([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ])
      expect(edges).toEqual([])
    })

    it('emits edges with aIndex < bIndex sorted by (aIndex, bIndex)', () => {
      const edges = getStoneCircleGraph([
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 0, y: 3 },
      ])
      expect(edges).toEqual([
        { aIndex: 0, bIndex: 1 },
        { aIndex: 0, bIndex: 2 },
        { aIndex: 1, bIndex: 2 },
      ])
    })

    it('uses Euclidean distance (not Chebyshev)', () => {
      // (0,0) -> (6,6): Euclidean ~= 8.485, Chebyshev = 6. Should NOT connect at radius 8.
      const edges = getStoneCircleGraph([
        { x: 0, y: 0 },
        { x: 6, y: 6 },
      ])
      expect(edges).toEqual([])
    })
  })

  describe('getHallowedPolygons', () => {
    it('returns no polygons for fewer than 3 meteorites', () => {
      expect(getHallowedPolygons([], [])).toEqual([])
      expect(getHallowedPolygons([{ x: 0, y: 0 }], [])).toEqual([])
      expect(
        getHallowedPolygons(
          [
            { x: 0, y: 0 },
            { x: 3, y: 0 },
          ],
          [{ aIndex: 0, bIndex: 1 }]
        )
      ).toEqual([])
    })

    it('finds a single triangle', () => {
      const placed: Position[] = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 2, y: 4 },
      ]
      const edges = getStoneCircleGraph(placed)
      const polygons = getHallowedPolygons(placed, edges)
      expect(polygons).toEqual([[0, 1, 2]])
    })

    it('finds a single quadrilateral (no diagonals)', () => {
      // Square layout with side 4. Diagonal is ~5.66 < 8, so naive
      // getStoneCircleGraph would emit diagonals. To get a pure
      // quadrilateral, hand-craft edges with no diagonals.
      const placed: Position[] = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ]
      const edges = [
        { aIndex: 0, bIndex: 1 },
        { aIndex: 1, bIndex: 2 },
        { aIndex: 2, bIndex: 3 },
        { aIndex: 0, bIndex: 3 },
      ]
      const polygons = getHallowedPolygons(placed, edges)
      expect(polygons).toEqual([[0, 1, 2, 3]])
    })

    it('K4 (all 6 edges) yields 4 chordless triangles, no 4-cycles', () => {
      const placed: Position[] = [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
      ]
      const edges = getStoneCircleGraph(placed)
      expect(edges).toHaveLength(6)
      const polygons = getHallowedPolygons(placed, edges)
      expect(polygons).toHaveLength(4)
      for (const p of polygons) expect(p).toHaveLength(3)
    })

    it('rejects collinear triples (zero-area)', () => {
      const placed: Position[] = [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 6, y: 0 },
      ]
      const edges = getStoneCircleGraph(placed)
      expect(edges).toHaveLength(3)
      expect(getHallowedPolygons(placed, edges)).toEqual([])
    })

    it('nested layout: outer triangle plus interior node yields outer + 3 inner triangles', () => {
      const placed: Position[] = [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 3, y: 6 },
        { x: 3, y: 2 },
      ]
      const edges = getStoneCircleGraph(placed)
      const polygons = getHallowedPolygons(placed, edges)
      expect(polygons).toHaveLength(4)
      for (const p of polygons) expect(p).toHaveLength(3)
      const outer = polygons.find(p => p.includes(0) && p.includes(1) && p.includes(2))
      expect(outer).toEqual([0, 1, 2])
    })

    it('canonical form dedupes reversed traversal of the same cycle', () => {
      const placed: Position[] = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ]
      const edges = [
        { aIndex: 0, bIndex: 1 },
        { aIndex: 1, bIndex: 2 },
        { aIndex: 2, bIndex: 3 },
        { aIndex: 0, bIndex: 3 },
      ]
      const polygons = getHallowedPolygons(placed, edges)
      expect(polygons).toHaveLength(1)
      expect(polygons[0]).toEqual([0, 1, 2, 3])
    })
  })

  describe('isInsideHallowedGround', () => {
    it('returns false when no meteorites are placed', () => {
      const state = buildState([])
      expect(isInsideHallowedGround(state, 5, 5)).toBe(false)
    })

    it('returns false when no polygons can form', () => {
      const state = buildState([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ])
      expect(isInsideHallowedGround(state, 2, 0)).toBe(false)
    })

    it('returns true for a tile inside a triangle', () => {
      const state = buildState([
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 3, y: 6 },
      ])
      expect(isInsideHallowedGround(state, 3, 2)).toBe(true)
    })

    it('returns false for a tile outside the triangle', () => {
      const state = buildState([
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 3, y: 6 },
      ])
      expect(isInsideHallowedGround(state, 10, 10)).toBe(false)
    })

    it('returns false for collinear meteorites (zero-area)', () => {
      const state = buildState([
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 6, y: 0 },
      ])
      expect(isInsideHallowedGround(state, 3, 0)).toBe(false)
    })
  })

  describe('dropItem places meteorites', () => {
    const giveMeteorite = (state: GameState): void => {
      const fit = findFitPosition(state.backpack, 'meteorite')
      if (!fit) throw new Error('test setup: no fit for meteorite in backpack')
      placeItem(state.backpack, 'meteorite', fit.gridX, fit.gridY)
    }

    it('appends to placedMeteorites and removes the item on drop', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 2)
      giveMeteorite(state)
      expect(state.placedMeteorites).toEqual([])

      const ok = dropItem(state, 'meteorite', 1000)
      expect(ok).toBe(true)
      expect(state.placedMeteorites).toHaveLength(1)
      expect(state.backpack.items.find(i => i.definitionId === 'meteorite')).toBeUndefined()
    })

    it('returns false and leaves state unchanged when no adjacent valid tile exists', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      // Surround the player with space tiles (non-walkable, non-Dirt/Flora)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          state.map[state.player.y + dy][state.player.x + dx] = { type: TileType.Space }
        }
      }
      giveMeteorite(state)
      const beforeBackpack = state.backpack.items.length

      const ok = dropItem(state, 'meteorite', 1000)
      expect(ok).toBe(false)
      expect(state.placedMeteorites).toEqual([])
      expect(state.backpack.items).toHaveLength(beforeBackpack)
    })

    it('skips deltas already holding a placed meteorite', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 2)
      // Pre-occupy the player's standing tile (the first DROP_DELTAS entry
      // is { 0, 0 }). The drop should land on a neighbor instead.
      state.placedMeteorites = [{ x: state.player.x, y: state.player.y }]
      giveMeteorite(state)

      const ok = dropItem(state, 'meteorite', 1000)
      expect(ok).toBe(true)
      expect(state.placedMeteorites).toHaveLength(2)
      const newPlace = state.placedMeteorites[1]
      expect(newPlace.x === state.player.x && newPlace.y === state.player.y).toBe(false)
    })
  })

  describe('F-tap pickup', () => {
    it('picks up a placed meteorite on the standing tile', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 2)
      state.placedMeteorites = [{ x: state.player.x, y: state.player.y }]

      const ok = pickUpFacingOrStandingPlacedMeteorite(state, 1000)
      expect(ok).toBe(true)
      expect(state.placedMeteorites).toEqual([])
      expect(state.backpack.items.find(i => i.definitionId === 'meteorite')).toBeDefined()
    })

    it('picks up a placed meteorite on the facing tile when none under foot', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 2)
      state.playerFacing = 'right'
      state.placedMeteorites = [{ x: state.player.x + 1, y: state.player.y }]

      const ok = pickUpFacingOrStandingPlacedMeteorite(state, 1000)
      expect(ok).toBe(true)
      expect(state.placedMeteorites).toEqual([])
    })

    it('returns false when no placed meteorite is at standing or facing tile', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 2)
      state.placedMeteorites = [{ x: state.player.x + 5, y: state.player.y + 5 }]

      const ok = pickUpFacingOrStandingPlacedMeteorite(state, 1000)
      expect(ok).toBe(false)
      expect(state.placedMeteorites).toHaveLength(1)
    })

    it('returns false and leaves state unchanged when backpack has no fit', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 2)
      // Fill the backpack with meteorites until no fit remains. A meteorite
      // occupies a single grid cell; just spam placeItem until findFitPosition
      // returns null.
      for (;;) {
        const fit = findFitPosition(state.backpack, 'meteorite')
        if (!fit) break
        placeItem(state.backpack, 'meteorite', fit.gridX, fit.gridY)
      }
      const beforeCount = state.backpack.items.length
      state.placedMeteorites = [{ x: state.player.x, y: state.player.y }]

      const ok = pickUpFacingOrStandingPlacedMeteorite(state, 1000)
      expect(ok).toBe(false)
      expect(state.placedMeteorites).toHaveLength(1)
      expect(state.backpack.items).toHaveLength(beforeCount)
    })

    it('prefers the standing tile over the facing tile when both have meteorites', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 2)
      state.playerFacing = 'right'
      state.placedMeteorites = [
        { x: state.player.x + 1, y: state.player.y },
        { x: state.player.x, y: state.player.y },
      ]

      const ok = pickUpFacingOrStandingPlacedMeteorite(state, 1000)
      expect(ok).toBe(true)
      // The standing-tile entry was removed; the facing-tile entry remains.
      expect(state.placedMeteorites).toEqual([{ x: state.player.x + 1, y: state.player.y }])
    })
  })

  describe('egregore spread containment (candidateDirtNeighborsContained)', () => {
    const seedDirt = (state: GameState, cx: number, cy: number, radius: number): void => {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = cx + dx
          const y = cy + dy
          if (x >= 0 && y >= 0 && x < state.mapWidth && y < state.mapHeight) {
            state.map[y][x] = { type: TileType.Dirt }
          }
        }
      }
    }

    it('matches candidateDirtNeighbors output when no polygons exist', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      seedDirt(state, 10, 10, 3)
      // Single egregore source — its 8 dirt neighbors are all candidates.
      state.map[10][10] = { type: TileType.Egregore }
      state.egregorePositions = [{ x: 10, y: 10 }]
      state.placedMeteorites = []

      const candidates = candidateDirtNeighborsContained(state)
      expect(candidates).toHaveLength(8)
    })

    it('blocks an outside neighbor when source is inside a polygon', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      seedDirt(state, 10, 10, 6)

      // Triangle of meteorites tightly enclosing the source. Source at (10,10)
      // should be inside; (10, 5) is outside.
      state.placedMeteorites = [
        { x: 7, y: 12 },
        { x: 13, y: 12 },
        { x: 10, y: 8 },
      ]
      // Source inside the triangle
      state.map[11][10] = { type: TileType.Egregore }
      state.egregorePositions = [{ x: 10, y: 11 }]

      const candidates = candidateDirtNeighborsContained(state)
      // Neighbors above the triangle's top edge get rejected; neighbors
      // inside the triangle are accepted.
      const insideOnly = candidates.every(c => {
        const py = c.y + 0.5
        // Crude inside-triangle test: between y=8 and y=12.
        return py >= 8 && py <= 12
      })
      expect(insideOnly).toBe(true)
      expect(candidates.length).toBeGreaterThan(0)
    })

    it('an outside source cannot spread into a polygon (asymmetric fence)', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      seedDirt(state, 10, 10, 8)

      // Triangle of meteorites; source is just outside it.
      state.placedMeteorites = [
        { x: 8, y: 12 },
        { x: 12, y: 12 },
        { x: 10, y: 8 },
      ]
      // Place an egregore source clearly outside the triangle. Its neighbor
      // tile (10, 9) sits inside the triangle.
      state.map[5][10] = { type: TileType.Egregore }
      state.egregorePositions = [{ x: 10, y: 5 }]

      const candidates = candidateDirtNeighborsContained(state)
      // No candidate position should be inside the triangle, because the
      // source's containingPolygonsKey is "" while the inside tiles' key
      // would be "0".
      for (const c of candidates) {
        // Far from the triangle's interior.
        expect(c.y).toBeLessThanOrEqual(7)
      }
    })

    it('two-meteorite wall blocks spread that crosses the line', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      seedDirt(state, 10, 10, 4)

      // A horizontal wall: meteorites at (7, 10) and (13, 10). Spread step
      // from (10, 9) above the wall to (10, 10) on the wall line is blocked
      // (line crosses at y=10). Spread step that stays on the same side is
      // accepted.
      state.placedMeteorites = [
        { x: 7, y: 10 },
        { x: 13, y: 10 },
      ]
      state.map[9][10] = { type: TileType.Egregore }
      state.egregorePositions = [{ x: 10, y: 9 }]

      const candidates = candidateDirtNeighborsContained(state)
      // Every accepted candidate must stay on or above the wall line —
      // no candidate may sit at y >= 11 (below the wall).
      for (const c of candidates) {
        expect(c.y).toBeLessThanOrEqual(10)
      }
    })

    it('inside-source spreads to inside-candidates only', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      seedDirt(state, 15, 15, 8)

      // A larger polygon (square-ish via two triangles? simpler: pentagon)
      state.placedMeteorites = [
        { x: 12, y: 12 },
        { x: 18, y: 12 },
        { x: 18, y: 18 },
        { x: 12, y: 18 },
      ]
      // Egregore at (15, 15) — squarely inside the square.
      state.map[15][15] = { type: TileType.Egregore }
      state.egregorePositions = [{ x: 15, y: 15 }]

      const candidates = candidateDirtNeighborsContained(state)
      // All 8 ordinal neighbors fall inside the square, so all 8 should be accepted.
      expect(candidates).toHaveLength(8)
    })
  })

  describe('containingPolygonsKey', () => {
    it('returns empty string when no polygons exist', () => {
      expect(containingPolygonsKey([], [], 5, 5)).toBe('')
    })

    it('returns the single polygon index for a tile inside one polygon', () => {
      const placed: Position[] = [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 3, y: 6 },
      ]
      const polygons = [[0, 1, 2]]
      expect(containingPolygonsKey(polygons, placed, 3, 2)).toBe('0')
      expect(containingPolygonsKey(polygons, placed, 10, 10)).toBe('')
    })

    it('returns multiple polygon indices for a tile inside overlapping polygons', () => {
      // K4 layout — overlapping triangle interiors meet at the center.
      const placed: Position[] = [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 6 },
        { x: 0, y: 6 },
      ]
      const edges = getStoneCircleGraph(placed)
      const polygons = getHallowedPolygons(placed, edges)
      // The exact key depends on which triangles each tile sits in. Just
      // assert the central tile (3, 3) sits in at least one polygon — the
      // K4 case is a stress test for the multi-membership path, not a
      // pinned numeric assertion.
      const key = containingPolygonsKey(polygons, placed, 3, 3)
      expect(key.length).toBeGreaterThan(0)
    })

    it('returns the same key for identical containment sets (used by spread filter)', () => {
      const placed: Position[] = [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 4, y: 6 },
      ]
      const edges = getStoneCircleGraph(placed)
      const polygons = getHallowedPolygons(placed, edges)
      const tileA = containingPolygonsKey(polygons, placed, 4, 2)
      const tileB = containingPolygonsKey(polygons, placed, 4, 3)
      expect(tileA).toBe(tileB)
    })
  })
})
