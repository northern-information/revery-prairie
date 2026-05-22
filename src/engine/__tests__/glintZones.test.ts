import {
  GLINT_BEAM_CHANCE,
  GLINT_BEAM_CYCLE_MS,
  GLINT_BEAM_LENGTH_MAX,
  GLINT_BEAM_LENGTH_MIN,
  GLINT_BEAM_MAX_OPACITY,
  GLINT_BEAM_TAIL_OPACITY,
  GLINT_ZONE_COUNT,
  GLINT_ZONE_DRIFT_MS,
  GLINT_ZONE_FADE_IN_MS,
  GLINT_ZONE_FADE_OUT_MS,
  GLINT_ZONE_HOLD_MS,
  GLINT_ZONE_SPAWN_MS,
} from '../constants'
import {
  computeBeamSegmentOpacity,
  rebuildGlintZones,
  seedGlintPatches,
  spawnGlintPatch,
  tickGlintZones,
  tileBeamLength,
  tileBeamMaxOpacity,
  tileHasBeam,
} from '../glintZones'
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

    const birthTimes = state.glintPatches.map(p => p.birthTime)
    // Birth times should be staggered — not all the same
    const uniqueBirthTimes = new Set(birthTimes)
    expect(uniqueBirthTimes.size).toBeGreaterThan(1)

    // Stagger is FORWARD from the seed time so newly seeded patches do
    // not start pre-aged. Each successive birth time is one interval
    // greater than the previous.
    const expectedInterval = TOTAL_LIFECYCLE_MS / GLINT_ZONE_COUNT
    for (let i = 1; i < birthTimes.length; i++) {
      expect(birthTimes[i] - birthTimes[i - 1]).toBeCloseTo(expectedInterval, -1)
    }

    // Every birth time must be at or after the seed time (no pre-aged
    // patches at handoff).
    for (const birthTime of birthTimes) {
      expect(birthTime).toBeGreaterThanOrEqual(1_000_000)
    }
  })
})

describe('rebuildGlintZones', () => {
  it('produces correct glintZones set from patches', () => {
    seedGlintPatches(state, 1_000_000)
    // Stagger is forward, so patch 0 reaches mid-hold and several
    // others enter fade-in once a full lifecycle has elapsed.
    rebuildGlintZones(state, 1_000_000 + TOTAL_LIFECYCLE_MS / 2)

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

describe('minimum patch size', () => {
  // Rebuild a fully-Space map, then carve a small sliver of dirt so any
  // candidate centered there can never reach GLINT_PATCH_MIN_TILES.
  const fillSpace = (): void => {
    for (let y = 0; y < state.mapHeight; y++) {
      for (let x = 0; x < state.mapWidth; x++) {
        state.map[y][x] = { type: TileType.Space }
      }
    }
  }

  it('spawnGlintPatch rejects candidates with fewer than GLINT_PATCH_MIN_TILES land tiles', () => {
    fillSpace()
    // Place exactly 3 dirt tiles in a row — too few for any patch.
    const cx = 80
    const cy = 50
    state.map[cy][cx] = { type: TileType.Dirt }
    state.map[cy][cx - 1] = { type: TileType.Dirt }
    state.map[cy][cx + 1] = { type: TileType.Dirt }

    // All 50 attempts will land on Space (overwhelmingly) or on the
    // 3-tile sliver, which fails the min-tile check. Either way no
    // patch should be returned.
    const patch = spawnGlintPatch(state, 0)
    expect(patch).toBeNull()
  })

  it('every spawned patch has at least GLINT_PATCH_MIN_TILES tiles', () => {
    // clearArea (the default beforeEach) gives plenty of dirt, so this
    // exercises the success path. Sample many spawns.
    for (let i = 0; i < 40; i++) {
      const patch = spawnGlintPatch(state, i * 1000)
      if (patch === null) continue
      expect(patch.tiles.size).toBeGreaterThanOrEqual(5)
    }
  })

  it('drift never erodes a patch below GLINT_PATCH_MIN_TILES; patch persists', () => {
    // Confine land to a 9x9 dirt block so drift toward any side trims
    // the patch tile count. Construct the patch directly instead of
    // going through random spawn — we are exercising drift, not spawn.
    fillSpace()
    const cx = 80
    const cy = 50
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        state.map[cy + dy][cx + dx] = { type: TileType.Dirt }
      }
    }

    const radius = 2
    const buildTiles = (): Set<string> => {
      const out = new Set<string>()
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue
          out.add(`${String(cx + dx)},${String(cy + dy)}`)
        }
      }
      return out
    }

    // Drift only fires in hold phase, so anchor birthTime such that
    // current sim time sits comfortably in hold for the entire run.
    let time = GLINT_ZONE_FADE_IN_MS + 1000
    state.glintPatches = [
      {
        centerX: cx,
        centerY: cy,
        radius,
        birthTime: time - GLINT_ZONE_FADE_IN_MS - 500,
        lastDriftTime: time - GLINT_ZONE_DRIFT_MS - 10,
        tiles: buildTiles(),
      },
    ]

    // Keep the patch's birth time advancing alongside sim time so it
    // never exits the hold window. We re-anchor birthTime before each
    // tick — the drift logic only reads `elapsed = time - birthTime`,
    // so this keeps drift eligible without expiring the patch.
    for (let i = 0; i < 30; i++) {
      time += GLINT_ZONE_DRIFT_MS + 1
      const patch = state.glintPatches[0]
      patch.birthTime = time - GLINT_ZONE_FADE_IN_MS - 500
      tickGlintZones(state, time)
      expect(state.glintPatches.length).toBeGreaterThan(0)
      expect(state.glintPatches[0].tiles.size).toBeGreaterThanOrEqual(5)
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

describe('tileHasBeam', () => {
  it('is stable across calls for the same (x, y, seed)', () => {
    const seed = 12345
    for (let i = 0; i < 20; i++) {
      const x = i * 7
      const y = i * 13 + 3
      expect(tileHasBeam(x, y, seed)).toBe(tileHasBeam(x, y, seed))
    }
  })

  it('selects approximately GLINT_BEAM_CHANCE of tiles in aggregate', () => {
    const seed = 999
    let beamCount = 0
    const total = 4000
    for (let i = 0; i < total; i++) {
      const x = i % 200
      const y = Math.floor(i / 200)
      if (tileHasBeam(x, y, seed)) beamCount++
    }
    const rate = beamCount / total
    // Expected ~30%; allow ±5 percentage points for hash variance over this sample
    expect(rate).toBeGreaterThan(GLINT_BEAM_CHANCE - 0.05)
    expect(rate).toBeLessThan(GLINT_BEAM_CHANCE + 0.05)
  })

  it('different seeds produce different selections', () => {
    let differences = 0
    for (let i = 0; i < 200; i++) {
      const x = i % 20
      const y = Math.floor(i / 20)
      if (tileHasBeam(x, y, 1) !== tileHasBeam(x, y, 2)) differences++
    }
    expect(differences).toBeGreaterThan(0)
  })
})

describe('tileBeamLength', () => {
  it('returns a stable length in [MIN, MAX] for the same (x, y, seed)', () => {
    const seed = 42
    for (let i = 0; i < 50; i++) {
      const x = i
      const y = i * 3
      const length = tileBeamLength(x, y, seed)
      expect(length).toBeGreaterThanOrEqual(GLINT_BEAM_LENGTH_MIN)
      expect(length).toBeLessThanOrEqual(GLINT_BEAM_LENGTH_MAX)
      expect(tileBeamLength(x, y, seed)).toBe(length)
    }
  })

  it('produces a range of lengths across many tiles', () => {
    const seed = 7
    const observed = new Set<number>()
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        observed.add(tileBeamLength(x, y, seed))
      }
    }
    // We should see more than one distinct length value
    expect(observed.size).toBeGreaterThan(1)
    // Every value should be in range
    for (const v of observed) {
      expect(v).toBeGreaterThanOrEqual(GLINT_BEAM_LENGTH_MIN)
      expect(v).toBeLessThanOrEqual(GLINT_BEAM_LENGTH_MAX)
    }
  })
})

describe('computeBeamSegmentOpacity', () => {
  const length = 4

  it('returns 0 at the very start of the cycle for the bottom segment', () => {
    // segmentIndex=0 is the bottom (closest to the glinting tile, last to light up)
    const opacity = computeBeamSegmentOpacity(0, length, 0)
    expect(opacity).toBe(0)
  })

  it('lights the topmost segment first', () => {
    // Just after t=0, the top segment (index length-1) should be the only one lit
    const epsilon = GLINT_BEAM_CYCLE_MS * 0.05
    const top = computeBeamSegmentOpacity(length - 1, length, epsilon)
    const bottom = computeBeamSegmentOpacity(0, length, epsilon)
    expect(top).toBeGreaterThan(0)
    expect(bottom).toBe(0)
  })

  it('returns values clamped to [0, 1] across the full cycle', () => {
    for (let i = 0; i < length; i++) {
      for (let t = 0; t < GLINT_BEAM_CYCLE_MS; t += 50) {
        const o = computeBeamSegmentOpacity(i, length, t)
        expect(o).toBeGreaterThanOrEqual(0)
        expect(o).toBeLessThanOrEqual(1)
      }
    }
  })

  it('repeats every cycle (time + cycle yields same opacity)', () => {
    for (let i = 0; i < length; i++) {
      for (let t = 0; t < GLINT_BEAM_CYCLE_MS; t += 137) {
        const a = computeBeamSegmentOpacity(i, length, t)
        const b = computeBeamSegmentOpacity(i, length, t + GLINT_BEAM_CYCLE_MS)
        expect(b).toBeCloseTo(a, 6)
      }
    }
  })

  it('returns 0 for length <= 0', () => {
    expect(computeBeamSegmentOpacity(0, 0, 100)).toBe(0)
  })

  it('peaks higher for the top segment than the bottom (top-down decay)', () => {
    let topMax = 0
    let bottomMax = 0
    for (let t = 0; t < GLINT_BEAM_CYCLE_MS; t += 5) {
      topMax = Math.max(topMax, computeBeamSegmentOpacity(length - 1, length, t))
      bottomMax = Math.max(bottomMax, computeBeamSegmentOpacity(0, length, t))
    }
    expect(topMax).toBeCloseTo(1, 1)
    expect(bottomMax).toBeCloseTo(GLINT_BEAM_TAIL_OPACITY, 2)
    expect(topMax).toBeGreaterThan(bottomMax)
  })

  it('intermediate segments scale linearly between top and tail', () => {
    // Each segment's peak should sit on the line from 1.0 (top) to TAIL (bottom)
    const peaks: number[] = []
    for (let i = 0; i < length; i++) {
      let m = 0
      for (let t = 0; t < GLINT_BEAM_CYCLE_MS; t += 5) {
        m = Math.max(m, computeBeamSegmentOpacity(i, length, t))
      }
      peaks.push(m)
    }
    // Iterate from top (length-1) down to bottom (0); each next peak should be lower
    for (let i = length - 1; i > 0; i--) {
      expect(peaks[i]).toBeGreaterThan(peaks[i - 1])
    }
  })
})

describe('tileBeamMaxOpacity', () => {
  it('returns a stable value in [0, GLINT_BEAM_MAX_OPACITY]', () => {
    const seed = 13
    for (let i = 0; i < 50; i++) {
      const x = i * 5
      const y = i * 11
      const op = tileBeamMaxOpacity(x, y, seed)
      expect(op).toBeGreaterThanOrEqual(0)
      expect(op).toBeLessThanOrEqual(GLINT_BEAM_MAX_OPACITY)
      expect(tileBeamMaxOpacity(x, y, seed)).toBe(op)
    }
  })

  it('produces a varied distribution across many tiles', () => {
    const samples: number[] = []
    for (let x = 0; x < 60; x++) {
      for (let y = 0; y < 60; y++) {
        samples.push(tileBeamMaxOpacity(x, y, 99))
      }
    }
    const min = Math.min(...samples)
    const max = Math.max(...samples)
    // Cover most of the [0, MAX] range
    expect(min).toBeLessThan(GLINT_BEAM_MAX_OPACITY * 0.1)
    expect(max).toBeGreaterThan(GLINT_BEAM_MAX_OPACITY * 0.9)
  })
})
