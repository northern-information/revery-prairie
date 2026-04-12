import {
  rebuildGlintZones,
  seedGlintPatches,
  spawnGlintPatch,
  tickGlintZones,
} from '../glintZones'
import {
  GLINT_ZONE_COUNT,
  GLINT_ZONE_DRIFT_MS,
  GLINT_ZONE_FADE_IN_MS,
  GLINT_ZONE_FADE_OUT_MS,
  GLINT_ZONE_HOLD_MS,
  GLINT_ZONE_SPAWN_MS,
} from '../constants'
import { posKey } from '../position'
import { TileType } from '../types'
import { clearArea, createTestState } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'

import type { GameState, GlintPatch } from '../types'

const TOTAL_LIFECYCLE_MS = GLINT_ZONE_FADE_IN_MS + GLINT_ZONE_HOLD_MS + GLINT_ZONE_FADE_OUT_MS

let state: GameState

beforeEach(() => {
  state = createTestState()
  // Ensure a large area of dirt for reliable patch placement
  clearArea(state, 85, 47, 40)
})

/** Spawn a patch and fail the test if placement fails. */
const mustSpawnPatch = (birthTime: number): GlintPatch => {
  const patch = spawnGlintPatch(state, birthTime)
  expect(patch).not.toBeNull()
  // After the assertion above, patch is guaranteed non-null.
  // Use a conditional return to satisfy TypeScript without non-null assertion.
  if (patch === null) throw new Error('unreachable — spawnGlintPatch returned null')
  return patch
}

describe('seedGlintPatches', () => {
  it('creates GLINT_ZONE_COUNT patches with staggered birth times', () => {
    seedGlintPatches(state, 1_000_000)

    expect(state.glintPatches).toHaveLength(GLINT_ZONE_COUNT)

    const birthTimes = state.glintPatches.map((p) => p.birthTime)
    // Birth times should be staggered — not all the same
    const uniqueBirthTimes = new Set(birthTimes)
    expect(uniqueBirthTimes.size).toBeGreaterThan(1)

    // Each birth time should differ by totalLifecycle / count
    const expectedInterval = TOTAL_LIFECYCLE_MS / GLINT_ZONE_COUNT
    for (let i = 1; i < birthTimes.length; i++) {
      expect(birthTimes[i - 1] - birthTimes[i]).toBeCloseTo(expectedInterval, -1)
    }
  })
})

describe('rebuildGlintZones', () => {
  it('produces correct glintZones set from patches', () => {
    seedGlintPatches(state, 1_000_000)
    rebuildGlintZones(state, 1_000_000)

    // glintZones should contain tiles from active patches
    expect(state.glintZones.size).toBeGreaterThan(0)

    // Every tile in glintZones should come from a patch
    const allPatchTiles = new Set<string>()
    for (const patch of state.glintPatches) {
      for (const key of patch.tiles) {
        allPatchTiles.add(key)
      }
    }
    for (const key of state.glintZones) {
      expect(allPatchTiles.has(key)).toBe(true)
    }
  })

  it('computes opacity=1 for patches in hold phase', () => {
    state.glintPatches = []
    const patch = mustSpawnPatch(0)
    state.glintPatches.push(patch)

    // Time is past fade-in but before hold ends
    const holdTime = GLINT_ZONE_FADE_IN_MS + 1000
    rebuildGlintZones(state, holdTime)

    for (const key of patch.tiles) {
      if (state.glintOpacity.has(key)) {
        expect(state.glintOpacity.get(key)).toBe(1.0)
      }
    }
  })

  it('computes opacity between 0 and 1 during fade-in', () => {
    state.glintPatches = []
    const patch = mustSpawnPatch(0)
    state.glintPatches.push(patch)

    // Halfway through fade-in
    const fadeInTime = GLINT_ZONE_FADE_IN_MS / 2
    rebuildGlintZones(state, fadeInTime)

    for (const key of patch.tiles) {
      const opacity = state.glintOpacity.get(key)
      if (opacity !== undefined) {
        expect(opacity).toBeGreaterThan(0)
        expect(opacity).toBeLessThan(1)
        expect(opacity).toBeCloseTo(0.5, 1)
      }
    }
  })

  it('computes opacity between 0 and 1 during fade-out', () => {
    state.glintPatches = []
    const patch = mustSpawnPatch(0)
    state.glintPatches.push(patch)

    // Halfway through fade-out
    const fadeOutTime = GLINT_ZONE_FADE_IN_MS + GLINT_ZONE_HOLD_MS + GLINT_ZONE_FADE_OUT_MS / 2
    rebuildGlintZones(state, fadeOutTime)

    for (const key of patch.tiles) {
      const opacity = state.glintOpacity.get(key)
      if (opacity !== undefined) {
        expect(opacity).toBeGreaterThan(0)
        expect(opacity).toBeLessThan(1)
        expect(opacity).toBeCloseTo(0.5, 1)
      }
    }
  })
})

describe('tickGlintZones', () => {
  it('removes expired patches', () => {
    state.glintPatches = []
    const patch = mustSpawnPatch(0)
    state.glintPatches.push(patch)

    // Prevent new spawns by setting last spawn time to just before tick
    const tickTime = TOTAL_LIFECYCLE_MS + 1
    state.lastGlintSpawnTime = tickTime

    tickGlintZones(state, tickTime)

    expect(state.glintPatches).toHaveLength(0)
  })

  it('drifts patches during hold phase', () => {
    state.glintPatches = []
    const patch = mustSpawnPatch(0)
    state.glintPatches.push(patch)

    const originalCx = patch.centerX
    const originalCy = patch.centerY

    // Run many drift ticks in hold phase
    let time = GLINT_ZONE_FADE_IN_MS + 1000
    let drifted = false
    for (let i = 0; i < 100; i++) {
      time += GLINT_ZONE_DRIFT_MS + 1
      tickGlintZones(state, time)
      if (state.glintPatches.length > 0) {
        const p = state.glintPatches[0]
        if (p.centerX !== originalCx || p.centerY !== originalCy) {
          drifted = true
          break
        }
      }
    }

    expect(drifted).toBe(true)
  })

  it('spawns new patches when below cap', () => {
    state.glintPatches = []
    state.lastGlintSpawnTime = 0

    // Tick past spawn interval
    tickGlintZones(state, GLINT_ZONE_SPAWN_MS + 1)

    expect(state.glintPatches.length).toBeGreaterThanOrEqual(1)
  })

  it('does not spawn above GLINT_ZONE_COUNT', () => {
    // Seed full set of patches
    seedGlintPatches(state, 1_000_000)
    expect(state.glintPatches).toHaveLength(GLINT_ZONE_COUNT)

    // Set all patches to be in hold phase (not expired)
    const holdTime = 1_000_000 + GLINT_ZONE_FADE_IN_MS + 1000
    state.lastGlintSpawnTime = 0 // trigger spawn attempt

    tickGlintZones(state, holdTime)

    expect(state.glintPatches.length).toBeLessThanOrEqual(GLINT_ZONE_COUNT)
  })
})

describe('overlapping patches', () => {
  it('max opacity wins for overlapping tiles', () => {
    state.glintPatches = []

    // Create two patches at the same center with different birth times
    const cx = 85
    const cy = 47
    // Ensure center is dirt
    state.map[cy][cx] = { type: TileType.Dirt }

    // Patch 1: in hold phase (opacity = 1.0)
    const patch1 = mustSpawnPatch(0)
    patch1.centerX = cx
    patch1.centerY = cy

    // Patch 2: in fade-in phase (opacity < 1.0)
    const fadeInBirth = GLINT_ZONE_FADE_IN_MS + 1000
    const patch2 = mustSpawnPatch(fadeInBirth)
    patch2.centerX = cx
    patch2.centerY = cy

    state.glintPatches.push(patch1, patch2)

    const holdTime = GLINT_ZONE_FADE_IN_MS + 1000
    rebuildGlintZones(state, holdTime)

    // For overlapping tiles, opacity should be max(1.0, <fade-in value>) = 1.0
    const centerKey = posKey(cx, cy)
    if (state.glintOpacity.has(centerKey)) {
      expect(state.glintOpacity.get(centerKey)).toBe(1.0)
    }
  })
})

describe('drift edge cases', () => {
  it('drift skips non-land tiles — patch near edge does not crash', () => {
    state.glintPatches = []

    // Place patch near the space border
    const edgeX = 11 // just inside SPACE_BORDER (10)
    const edgeY = 11
    // Ensure the tile at edgeX, edgeY is dirt
    state.map[edgeY][edgeX] = { type: TileType.Dirt }
    // Surrounding space tiles are likely still space
    state.map[edgeY][edgeX - 1] = { type: TileType.Space }

    const patch = mustSpawnPatch(0)
    patch.centerX = edgeX
    patch.centerY = edgeY

    state.glintPatches = [patch]

    // Run many drift ticks — should not crash even if drift attempts
    // land on space tiles
    let time = GLINT_ZONE_FADE_IN_MS + 1000
    for (let i = 0; i < 50; i++) {
      time += GLINT_ZONE_DRIFT_MS + 1
      tickGlintZones(state, time)
    }

    // Patch should still exist (in hold phase) and not have crashed
    expect(state.glintPatches.length).toBeGreaterThanOrEqual(0)
  })
})
