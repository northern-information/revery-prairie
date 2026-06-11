import { afterEach, describe, expect, it, vi } from 'vitest'

import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { createGenesisState, GENESIS_EPOCHS, nameToSeed, precomputeGenesis } from '../genesis'
import { computeReachableMass } from '../genesis/shared/reachableMass'
import { movePlayer } from '../movement'
import { findPath } from '../pathfinding'
import { isClimbableStep, posKey } from '../position'
import { ELEVATION_TIER_COUNT, ELEVATION_TIER_LIFT_PX, getElevationTier, getTierLift } from '../tileBg'
import { TileType } from '../types'

import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'

import type { Tile } from '../types'

// RP-49 — Cube-based verticality.
// Tier size = 100 / 7 ≈ 14.286 raw elevation units per cube.
// Reference values:
//   30 → tier 2
//   50 → tier 3 (prairie default)
//   64 → tier 4 (one cube above 50; climbable)
//   80 → tier 5 (two cubes above 50; unclimbable)
//   95 → tier 6

describe('cube verticality', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('cube constants', () => {
    it('exposes seven tiers (0..6) and a one-iso-diamond lift per cube', () => {
      expect(ELEVATION_TIER_COUNT).toBe(7)
      expect(ELEVATION_TIER_LIFT_PX).toBe(14)
    })

    it('getElevationTier maps the 0..100 elevation range across 0..6', () => {
      expect(getElevationTier(0)).toBe(0)
      expect(getElevationTier(50)).toBe(3)
      expect(getElevationTier(64)).toBe(4)
      expect(getElevationTier(80)).toBe(5)
      expect(getElevationTier(95)).toBe(6)
      expect(getElevationTier(100)).toBe(6) // clamped
      expect(getElevationTier(undefined)).toBe(0)
    })

    it('getTierLift returns -tier * ELEVATION_TIER_LIFT_PX for a six-cube tower', () => {
      expect(getTierLift(0)).toBeCloseTo(0)
      expect(getTierLift(1)).toBe(-14)
      expect(getTierLift(6)).toBe(-84)
    })
  })

  describe('tier-delta climb rule', () => {
    it('accepts a flat step (tier delta 0)', () => {
      const elev = new Map<string, number>([
        [posKey(0, 0), 50],
        [posKey(1, 0), 55],
      ])
      expect(isClimbableStep(elev, 0, 0, 1, 0)).toBe(true)
    })

    it('accepts a one-cube step (tier delta 1) in either direction', () => {
      const elev = new Map<string, number>([
        [posKey(0, 0), 50],
        [posKey(1, 0), 64],
      ])
      expect(isClimbableStep(elev, 0, 0, 1, 0)).toBe(true)
      expect(isClimbableStep(elev, 1, 0, 0, 0)).toBe(true)
    })

    it('rejects a two-cube step (tier delta 2)', () => {
      const elev = new Map<string, number>([
        [posKey(0, 0), 50],
        [posKey(1, 0), 80],
      ])
      expect(isClimbableStep(elev, 0, 0, 1, 0)).toBe(false)
      expect(isClimbableStep(elev, 1, 0, 0, 0)).toBe(false)
    })

    it('rejects a six-cube cliff (tier delta 6, the maximum possible)', () => {
      const elev = new Map<string, number>([
        [posKey(0, 0), 0],
        [posKey(1, 0), 95],
      ])
      expect(isClimbableStep(elev, 0, 0, 1, 0)).toBe(false)
    })

    it('treats undefined elevation as climbable (cave / ungenerated)', () => {
      const elev = new Map<string, number>([[posKey(0, 0), 50]])
      expect(isClimbableStep(elev, 0, 0, 1, 0)).toBe(true)
      expect(isClimbableStep(new Map(), 0, 0, 5, 5)).toBe(true)
    })

    it('frozenStairways override bridges a multi-cube upward step (RP-64 lock)', () => {
      const elev = new Map<string, number>([
        [posKey(0, 0), 50],
        [posKey(1, 0), 80],
      ])
      const upwardKey = `${posKey(0, 0)}->${posKey(1, 0)}`
      const frozen = new Set([upwardKey])
      expect(isClimbableStep(elev, 0, 0, 1, 0, frozen)).toBe(true)
      // Reverse (downward) is NOT in the set; remains rejected per v11 R5.
      expect(isClimbableStep(elev, 1, 0, 0, 0, frozen)).toBe(false)
    })
  })

  describe('movement on cube terrain', () => {
    it('accepts a one-cube step', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 3)
      const px = state.player.x
      const py = state.player.y
      state.elevation.set(posKey(px, py), 50)
      state.elevation.set(posKey(px + 1, py), 64)
      expect(movePlayer(state, 'right')).toBe(true)
      expect(state.player).toEqual({ x: px + 1, y: py })
    })

    it('rejects a two-cube step', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 3)
      const px = state.player.x
      const py = state.player.y
      state.elevation.set(posKey(px, py), 50)
      state.elevation.set(posKey(px + 1, py), 80)
      expect(movePlayer(state, 'right')).toBe(false)
      expect(state.player).toEqual({ x: px, y: py })
    })
  })

  describe('pathfinding on cube terrain', () => {
    it('returns null across a total two-cube wall', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 4)
      const px = state.player.x
      const py = state.player.y
      state.elevation.set(posKey(px, py), 50)
      // Two-tier wall spanning the entire mapHeight in column px+1.
      for (let y = 0; y < state.mapHeight; y++) {
        state.elevation.set(posKey(px, y), 50)
        state.elevation.set(posKey(px + 1, y), 80)
      }
      const path = findPath(
        state.map,
        state.mapWidth,
        state.mapHeight,
        state.player,
        { x: px + 2, y: py },
        undefined,
        { elevation: state.elevation }
      )
      expect(path).toBeNull()
    })

    it('finds a stairstep path that crosses one cube per step', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      clearAroundPlayer(state, 4)
      const px = state.player.x
      const py = state.player.y
      // 50 → 64 → 80 → 95 stairstep east of the player.
      state.elevation.set(posKey(px, py), 50)
      state.elevation.set(posKey(px + 1, py), 64)
      state.elevation.set(posKey(px + 2, py), 80)
      state.elevation.set(posKey(px + 3, py), 95)
      const path = findPath(
        state.map,
        state.mapWidth,
        state.mapHeight,
        state.player,
        { x: px + 3, y: py },
        undefined,
        { elevation: state.elevation }
      )
      expect(path).not.toBeNull()
      if (path) {
        let prev = state.player
        for (const step of path) {
          expect(isClimbableStep(state.elevation, prev.x, prev.y, step.x, step.y)).toBe(true)
          prev = step
        }
      }
    })
  })

  describe('reachable-mass under the cube rule', () => {
    const makeFlatGrid = (w: number, h: number): Tile[][] =>
      Array.from({ length: h }, () => Array.from({ length: w }, () => ({ type: TileType.Dirt }) as Tile))

    it('excludes a two-cube-walled mesa from the spawn cohort', () => {
      const grid = makeFlatGrid(5, 5)
      const elev = new Map<string, number>()
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) elev.set(posKey(x, y), 50)
      }
      for (let y = 0; y < 5; y++) {
        elev.set(posKey(3, y), 80)
        elev.set(posKey(4, y), 80)
      }
      const mass = computeReachableMass(grid, elev, 5, 5, 2, 2)
      expect(mass.size).toBe(15) // columns 0-2
      expect(mass.has(posKey(3, 2))).toBe(false)
    })

    it('includes a stairstep-accessible peak', () => {
      const grid = makeFlatGrid(5, 5)
      const elev = new Map<string, number>()
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) elev.set(posKey(x, y), 50)
      }
      elev.set(posKey(1, 2), 50)
      elev.set(posKey(2, 2), 64)
      elev.set(posKey(3, 2), 80)
      elev.set(posKey(4, 2), 95)
      const mass = computeReachableMass(grid, elev, 5, 5, 1, 2)
      expect(mass.has(posKey(4, 2))).toBe(true)
    })
  })

  describe('genesis tectonic uplift surfaces the upper cubes', () => {
    // Six fixed steward names → six deterministic genesis seeds.
    const SEEDS = ['Acacia', 'Bishop', 'Clio', 'Dune', 'Elara', 'Finch']

    const runGenesisForSeed = (name: string) => {
      const seed = nameToSeed(name)
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, seed)
      precomputeGenesis(sim, GENESIS_EPOCHS)
      return sim
    }

    const tierHistogram = (elevation: Map<string, number>, landMask: Set<string>): number[] => {
      const counts = new Array<number>(ELEVATION_TIER_COUNT).fill(0)
      for (const key of landMask) {
        const elev = elevation.get(key)
        if (elev === undefined) continue
        const tier = getElevationTier(elev)
        counts[tier] = (counts[tier] ?? 0) + 1
      }
      return counts
    }

    // RP-49 ships the cube model + climb rule without modifying the
    // tectonic-uplift epoch — every signed-amplitude variant attempted
    // broke either the sand-water-only or terrain-connectivity
    // invariants (the RP-41 R3 water-placement wall). The default
    // elevation base of 50 (tier 3) plus positive-only uplift surfaces
    // tiers 3-6 from genesis; lower tiers (0-2) arrive via satellite
    // craters and are a deferred concern. This test asserts that the
    // upper cubes appear and that no single tier dominates.
    it('produces tier 3 plus at least one upper tier on every seed', () => {
      for (const seedName of SEEDS) {
        const sim = runGenesisForSeed(seedName)
        const counts = tierHistogram(sim.elevation, sim.landMask)
        expect(counts[3]).toBeGreaterThan(0) // mid-prairie default
        const upperTotal = (counts[4] ?? 0) + (counts[5] ?? 0) + (counts[6] ?? 0)
        expect(upperTotal).toBeGreaterThan(0) // at least one tile lifted by uplift
      }
    })

    it('no single tier dominates beyond 95% of the walkable land', () => {
      for (const seedName of SEEDS) {
        const sim = runGenesisForSeed(seedName)
        const counts = tierHistogram(sim.elevation, sim.landMask)
        const totalLand = counts.reduce((a, b) => a + b, 0)
        for (const c of counts) {
          expect(c / totalLand).toBeLessThanOrEqual(0.95)
        }
      }
    })
  })
})
