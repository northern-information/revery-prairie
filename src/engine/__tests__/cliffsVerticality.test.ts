import { describe, expect, it } from 'vitest'

import { computeReachableMass } from '../genesis/shared/reachableMass'
import { movePlayer } from '../movement'
import { findPath } from '../pathfinding'
import { CLIMBABLE_STEP_THRESHOLD, isClimbableStep, posKey } from '../position'
import { TileType, Zone } from '../types'

import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'

import type { Tile } from '../types'

describe('cliffs and verticality', () => {
  describe('isClimbableStep predicate', () => {
    it('returns true when delta is within threshold', () => {
      const elev = new Map<string, number>([
        [posKey(0, 0), 50],
        [posKey(1, 0), 50 + CLIMBABLE_STEP_THRESHOLD],
      ])
      expect(isClimbableStep(elev, 0, 0, 1, 0)).toBe(true)
    })

    it('returns false when delta exceeds threshold (in either direction)', () => {
      const elev = new Map<string, number>([
        [posKey(0, 0), 50],
        [posKey(1, 0), 50 + CLIMBABLE_STEP_THRESHOLD + 1],
      ])
      expect(isClimbableStep(elev, 0, 0, 1, 0)).toBe(false)
      // delta abs — reverse direction same result
      expect(isClimbableStep(elev, 1, 0, 0, 0)).toBe(false)
    })

    it('returns true when either tile lacks an elevation entry (cave / out-of-bounds)', () => {
      const elev = new Map<string, number>([[posKey(0, 0), 50]])
      expect(isClimbableStep(elev, 0, 0, 1, 0)).toBe(true)
      expect(isClimbableStep(elev, 1, 0, 0, 0)).toBe(true)
      expect(isClimbableStep(new Map(), 0, 0, 5, 5)).toBe(true)
    })

    it('honors the optional threshold override', () => {
      const elev = new Map<string, number>([
        [posKey(0, 0), 50],
        [posKey(1, 0), 60],
      ])
      expect(isClimbableStep(elev, 0, 0, 1, 0, 5)).toBe(false)
      expect(isClimbableStep(elev, 0, 0, 1, 0, 20)).toBe(true)
    })
  })

  describe('movement gated by climbable step', () => {
    it('blocks cardinal move when destination elevation exceeds threshold', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 3)
      const px = state.player.x
      const py = state.player.y
      state.elevation.set(posKey(px, py), 50)
      state.elevation.set(posKey(px + 1, py), 50 + CLIMBABLE_STEP_THRESHOLD + 5)
      const before = { x: px, y: py }
      const ok = movePlayer(state, 'right')
      expect(ok).toBe(false)
      expect(state.player).toEqual(before)
    })

    it('allows cardinal move when destination elevation is within threshold', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 3)
      const px = state.player.x
      const py = state.player.y
      state.elevation.set(posKey(px, py), 50)
      state.elevation.set(posKey(px + 1, py), 50 + CLIMBABLE_STEP_THRESHOLD)
      const ok = movePlayer(state, 'right')
      expect(ok).toBe(true)
      expect(state.player).toEqual({ x: px + 1, y: py })
    })

    it('blocks diagonal when either cardinal corner is unclimbable', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 3)
      const px = state.player.x
      const py = state.player.y
      // Player at center; destination (px+1, py+1) is climbable, but
      // the (px+1, py) cardinal corner is unclimbable. Diagonal must
      // be rejected.
      state.elevation.set(posKey(px, py), 50)
      state.elevation.set(posKey(px + 1, py), 50 + CLIMBABLE_STEP_THRESHOLD + 5)
      state.elevation.set(posKey(px, py + 1), 50)
      state.elevation.set(posKey(px + 1, py + 1), 50)
      const before = { x: px, y: py }
      const ok = movePlayer(state, 'downRight')
      expect(ok).toBe(false)
      expect(state.player).toEqual(before)
    })

    it('cave-zone movement is unaffected (no elevation entries)', () => {
      const state = createTestState()
      // currentZone defaults to Overworld from createTestState; the
      // elevation map only has entries for overworld tiles, so a cave-
      // like map without elevation entries should not produce spurious
      // blocks. Simulate by clearing elevation around the player.
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 3)
      const px = state.player.x
      const py = state.player.y
      state.elevation.delete(posKey(px, py))
      state.elevation.delete(posKey(px + 1, py))
      const ok = movePlayer(state, 'right')
      expect(ok).toBe(true)
      expect(state.player).toEqual({ x: px + 1, y: py })
    })
  })

  describe('pathfinding respects climbable step', () => {
    it('refuses a direct path through an unclimbable step when elevation is supplied', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 4)
      const px = state.player.x
      const py = state.player.y
      // Wall of high elevation across (px+1, py-1..py+1)
      state.elevation.set(posKey(px, py), 50)
      for (let dy = -1; dy <= 1; dy++) {
        state.elevation.set(posKey(px + 1, py + dy), 50 + CLIMBABLE_STEP_THRESHOLD + 10)
      }
      // Beyond the wall, low again — same elevation as player
      state.elevation.set(posKey(px + 2, py), 50)

      const withoutElev = findPath(state.map, state.mapWidth, state.mapHeight, state.player, { x: px + 2, y: py })
      expect(withoutElev).not.toBeNull()
      // (no elevation arg → unaffected, path goes through)

      const withElev = findPath(
        state.map,
        state.mapWidth,
        state.mapHeight,
        state.player,
        { x: px + 2, y: py },
        undefined,
        { elevation: state.elevation }
      )
      // The wall blocks the direct cardinal route. A* may find a path
      // around it through tiles outside the wall slice, or return null
      // if the wall is total. Either is acceptable as long as NO step
      // in the returned path crosses an unclimbable delta.
      if (withElev) {
        let prev = state.player
        for (const step of withElev) {
          expect(isClimbableStep(state.elevation, prev.x, prev.y, step.x, step.y)).toBe(true)
          prev = step
        }
      }
    })
  })

  describe('computeReachableMass', () => {
    const makeFlatGrid = (w: number, h: number): Tile[][] =>
      Array.from({ length: h }, () => Array.from({ length: w }, () => ({ type: TileType.Dirt }) as Tile))

    it('includes every walkable tile when elevation is flat', () => {
      const grid = makeFlatGrid(5, 5)
      const elev = new Map<string, number>()
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) elev.set(posKey(x, y), 50)
      }
      const mass = computeReachableMass(grid, elev, 5, 5, 2, 2)
      expect(mass.size).toBe(25)
      expect(mass.has(posKey(0, 0))).toBe(true)
      expect(mass.has(posKey(4, 4))).toBe(true)
    })

    it('excludes a topographically isolated mesa', () => {
      const grid = makeFlatGrid(5, 5)
      const elev = new Map<string, number>()
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) elev.set(posKey(x, y), 50)
      }
      // Lift tiles (3, *) and (4, *) into a mesa that is unclimbable
      // from the spawn-side (column 2).
      for (let y = 0; y < 5; y++) {
        elev.set(posKey(3, y), 50 + CLIMBABLE_STEP_THRESHOLD + 10)
        elev.set(posKey(4, y), 50 + CLIMBABLE_STEP_THRESHOLD + 10)
      }
      const mass = computeReachableMass(grid, elev, 5, 5, 2, 2)
      // Spawn-side cohort (columns 0-2) reachable; mesa (3-4) excluded.
      expect(mass.size).toBe(15)
      expect(mass.has(posKey(2, 2))).toBe(true)
      expect(mass.has(posKey(3, 2))).toBe(false)
      expect(mass.has(posKey(4, 2))).toBe(false)
    })

    it('honors a tiny seed without re-rolling (per v11 R3 lock)', () => {
      const grid = makeFlatGrid(5, 5)
      const elev = new Map<string, number>()
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) elev.set(posKey(x, y), 50)
      }
      // Isolate the spawn into a 1-tile pocket: ring it with unclimbable
      // tiles in all four cardinal neighbors.
      const spawn = { x: 2, y: 2 }
      elev.set(posKey(spawn.x + 1, spawn.y), 50 + CLIMBABLE_STEP_THRESHOLD + 10)
      elev.set(posKey(spawn.x - 1, spawn.y), 50 + CLIMBABLE_STEP_THRESHOLD + 10)
      elev.set(posKey(spawn.x, spawn.y + 1), 50 + CLIMBABLE_STEP_THRESHOLD + 10)
      elev.set(posKey(spawn.x, spawn.y - 1), 50 + CLIMBABLE_STEP_THRESHOLD + 10)
      const mass = computeReachableMass(grid, elev, 5, 5, spawn.x, spawn.y)
      expect(mass.size).toBe(1)
      expect(mass.has(posKey(spawn.x, spawn.y))).toBe(true)
    })

    it('is read-only — does not mutate grid or elevation', () => {
      const grid = makeFlatGrid(4, 4)
      const elev = new Map<string, number>()
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) elev.set(posKey(x, y), 50)
      }
      elev.set(posKey(3, 3), 99)
      const elevSnapshot = new Map(elev)
      const gridSnapshot = grid.map(row => row.map(t => ({ ...t })))
      computeReachableMass(grid, elev, 4, 4, 0, 0)
      expect(elev).toEqual(elevSnapshot)
      expect(grid).toEqual(gridSnapshot)
    })

    it('treats non-walkable tile types as barriers (does not enter Space)', () => {
      const grid = makeFlatGrid(5, 5)
      const elev = new Map<string, number>()
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) elev.set(posKey(x, y), 50)
      }
      // Column 3 is Space — walls the spawn cohort off from columns 4
      for (let y = 0; y < 5; y++) grid[y][3] = { type: TileType.Space }
      const mass = computeReachableMass(grid, elev, 5, 5, 2, 2)
      expect(mass.has(posKey(2, 2))).toBe(true)
      expect(mass.has(posKey(3, 2))).toBe(false)
      expect(mass.has(posKey(4, 2))).toBe(false)
    })
  })

  describe('GameState.reachableMass', () => {
    it('is populated at state construction and contains the player spawn', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      expect(state.reachableMass).toBeInstanceOf(Set)
      expect(state.reachableMass.has(posKey(state.player.x, state.player.y))).toBe(true)
    })

    it('is non-trivial for the standard genesis seed (more than one tile)', () => {
      const state = createTestState()
      expect(state.reachableMass.size).toBeGreaterThan(1)
    })

    it('survives a zone swap to cave (no recomputation, no mutation)', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      const before = new Set(state.reachableMass)
      state.currentZone = Zone.Cave
      // Movement in the cave should not touch reachableMass.
      expect(state.reachableMass).toEqual(before)
    })
  })
})
