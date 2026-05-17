import { createGenesisState, extractGenesisResult } from '../genesis'
import { liftAtSim, recordVisibleTierChange, tileLiftAtSim } from '../genesisRenderer'
import { posKey } from '../position'
import { easeInOutCubic, getTierLift, TIER_TWEEN_DURATION_MS, WATER_SINK_PX } from '../tileBg'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

import type { GenesisSimState } from '../genesisTypes'

// Build a tiny sim that has just enough state for the renderer helpers
// to operate on. The renderer reads sim.landMask, sim.elevation,
// sim.tierTweens, and sim.lastObservedTier; nothing else is needed for
// these unit tests.
const buildSim = (): GenesisSimState => {
  const sim = createGenesisState(3, 3, 1)
  // Make the entire grid land so wall-pass helpers don't short-circuit.
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      sim.grid[y][x] = { type: TileType.Dirt }
      sim.landMask.add(posKey(x, y))
    }
  }
  return sim
}

const setTier = (sim: GenesisSimState, x: number, y: number, tier: number): void => {
  // Elevation is bucketed into 4 tiers of size 25; mid-bucket value is stable.
  sim.elevation.set(posKey(x, y), tier * 25 + 12)
}

describe('genesis elevation tween', () => {
  describe('liftAtSim', () => {
    it('returns the discrete tier lift when no tween record exists', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 2)
      expect(liftAtSim(sim, 1, 1, 0)).toBe(getTierLift(2))
    })

    it('returns the tier lift even when sim.elevation is missing (defaults to tier 0)', () => {
      const sim = buildSim()
      expect(liftAtSim(sim, 1, 1, 0)).toBe(getTierLift(0))
    })

    it('eases from fromLift to getTierLift(toTier) over TIER_TWEEN_DURATION_MS', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 2)
      const fromLift = getTierLift(0)
      const startMs = 1000
      sim.tierTweens.set(posKey(1, 1), { fromLift, toTier: 2, startMs })

      // u = 0 → returns fromLift
      expect(liftAtSim(sim, 1, 1, startMs)).toBe(fromLift)

      // u = 0.5 → eased mid-point
      const mid = startMs + TIER_TWEEN_DURATION_MS / 2
      const easedHalf = easeInOutCubic(0.5)
      const expectedMid = fromLift + (getTierLift(2) - fromLift) * easedHalf
      expect(liftAtSim(sim, 1, 1, mid)).toBeCloseTo(expectedMid, 6)

      // u = 1 → exactly getTierLift(toTier)
      expect(liftAtSim(sim, 1, 1, startMs + TIER_TWEEN_DURATION_MS)).toBe(getTierLift(2))

      // u > 1 → clamped, still exactly getTierLift(toTier)
      expect(liftAtSim(sim, 1, 1, startMs + TIER_TWEEN_DURATION_MS * 10)).toBe(getTierLift(2))
    })

    it('produces a continuous sub-pixel value during the tween window', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 3)
      const fromLift = getTierLift(0)
      const startMs = 0
      sim.tierTweens.set(posKey(1, 1), { fromLift, toTier: 3, startMs })
      const liftA = liftAtSim(sim, 1, 1, TIER_TWEEN_DURATION_MS * 0.4)
      const liftB = liftAtSim(sim, 1, 1, TIER_TWEEN_DURATION_MS * 0.41)
      expect(liftA).not.toBe(getTierLift(0))
      expect(liftA).not.toBe(getTierLift(3))
      // Lift is moving (continuous, not snapping)
      expect(liftA).not.toBe(liftB)
    })
  })

  describe('recordVisibleTierChange', () => {
    it('records the current tier without starting a tween on first observation', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 2)
      recordVisibleTierChange(sim, 1, 1, 1000)
      expect(sim.lastObservedTier.get(posKey(1, 1))).toBe(2)
      expect(sim.tierTweens.has(posKey(1, 1))).toBe(false)
    })

    it('does not bookkeep tiles outside the land mask', () => {
      const sim = buildSim()
      sim.landMask.delete(posKey(1, 1))
      setTier(sim, 1, 1, 2)
      recordVisibleTierChange(sim, 1, 1, 1000)
      expect(sim.lastObservedTier.has(posKey(1, 1))).toBe(false)
      expect(sim.tierTweens.has(posKey(1, 1))).toBe(false)
    })

    it('starts a tween from the prior tier lift when the tier changes', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 0)
      recordVisibleTierChange(sim, 1, 1, 1000)
      setTier(sim, 1, 1, 2)
      recordVisibleTierChange(sim, 1, 1, 1500)
      const tween = sim.tierTweens.get(posKey(1, 1))
      expect(tween).toBeDefined()
      expect(tween?.fromLift).toBe(getTierLift(0))
      expect(tween?.toTier).toBe(2)
      expect(tween?.startMs).toBe(1500)
      expect(sim.lastObservedTier.get(posKey(1, 1))).toBe(2)
    })

    it('does nothing when the tier matches the previously observed tier', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 2)
      recordVisibleTierChange(sim, 1, 1, 1000)
      recordVisibleTierChange(sim, 1, 1, 1100)
      expect(sim.tierTweens.has(posKey(1, 1))).toBe(false)
    })

    it('samples the in-flight tweened lift when a tile changes back mid-tween', () => {
      const sim = buildSim()
      // First observation at tier 0
      setTier(sim, 1, 1, 0)
      recordVisibleTierChange(sim, 1, 1, 0)
      // Climb to tier 2 — starts a tween from getTierLift(0)
      setTier(sim, 1, 1, 2)
      recordVisibleTierChange(sim, 1, 1, 0)
      // Sample at midpoint of the first tween
      const midTime = TIER_TWEEN_DURATION_MS / 2
      const inFlightLift = liftAtSim(sim, 1, 1, midTime)
      // Tier flips back to 0 mid-tween — new tween should start from the
      // currently visible lift, NOT from getTierLift(2).
      setTier(sim, 1, 1, 0)
      recordVisibleTierChange(sim, 1, 1, midTime)
      const tween = sim.tierTweens.get(posKey(1, 1))
      expect(tween).toBeDefined()
      expect(tween?.fromLift).toBeCloseTo(inFlightLift, 6)
      expect(tween?.toTier).toBe(0)
      expect(tween?.startMs).toBe(midTime)
      // No snap: the immediate lift right after the change matches inFlightLift.
      expect(liftAtSim(sim, 1, 1, midTime)).toBeCloseTo(inFlightLift, 6)
    })
  })

  describe('walls track tweened lift', () => {
    it('wall depth between two tiles is identical to the pre-change formula when no tweens are active', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 2) // self
      setTier(sim, 1, 2, 0) // south
      setTier(sim, 2, 1, 1) // east
      // Establish lastObserved without starting tweens
      recordVisibleTierChange(sim, 1, 1, 0)
      recordVisibleTierChange(sim, 1, 2, 0)
      recordVisibleTierChange(sim, 2, 1, 0)
      const selfLift = liftAtSim(sim, 1, 1, 0)
      const southLift = liftAtSim(sim, 1, 2, 0)
      const eastLift = liftAtSim(sim, 2, 1, 0)
      // Lifts are negative-when-up: south_lift - self_lift = 0 - (-12) = 12 = (2-0)*6
      expect(Math.max(0, southLift - selfLift)).toBe(12)
      expect(Math.max(0, eastLift - selfLift)).toBe(6)
    })

    it('wall depth changes smoothly when self is tweening', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 0) // self
      setTier(sim, 1, 2, 0) // south
      recordVisibleTierChange(sim, 1, 1, 0)
      recordVisibleTierChange(sim, 1, 2, 0)
      // Self climbs from 0 to 2 — south stays put.
      setTier(sim, 1, 1, 2)
      recordVisibleTierChange(sim, 1, 1, 0)
      const t0 = 0
      const t1 = TIER_TWEEN_DURATION_MS * 0.25
      const t2 = TIER_TWEEN_DURATION_MS * 0.75
      const t3 = TIER_TWEEN_DURATION_MS
      const depth = (time: number): number => Math.max(0, liftAtSim(sim, 1, 2, time) - liftAtSim(sim, 1, 1, time))
      expect(depth(t0)).toBe(0) // self lift still 0 at u=0
      expect(depth(t3)).toBe(12) // fully landed at tier 2 vs tier 0
      expect(depth(t1)).toBeGreaterThan(0)
      expect(depth(t1)).toBeLessThan(depth(t2))
      expect(depth(t2)).toBeLessThan(depth(t3))
    })
  })

  describe('cosmetic-only scope', () => {
    it('extractGenesisResult does not surface tween state', () => {
      const sim = buildSim()
      sim.tierTweens.set(posKey(1, 1), { fromLift: 0, toTier: 2, startMs: 0 })
      sim.lastObservedTier.set(posKey(1, 1), 2)
      const result = extractGenesisResult(sim)
      const resultKeys = Object.keys(result)
      expect(resultKeys).not.toContain('tierTweens')
      expect(resultKeys).not.toContain('lastObservedTier')
    })

    it('GenesisResult type has no tween fields (compile-time guard)', () => {
      // Compile-time: if a future change adds tierTweens/lastObservedTier
      // to GenesisResult, this destructure will type-check successfully
      // and the asserted shape below will need to be updated to match.
      const sim = buildSim()
      const result = extractGenesisResult(sim)
      const expected: readonly (keyof typeof result)[] = [
        'terrain',
        'soilHealth',
        'elevation',
        'ruins',
        'ponds',
        'rivers',
        'burnScars',
        'craters',
      ]
      expect(Object.keys(result).sort()).toEqual([...expected].sort())
    })
  })

  describe('water sinks below dirt', () => {
    it('tileLiftAtSim returns liftAtSim + WATER_SINK_PX for river tiles', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 0)
      sim.riverPaths.add(posKey(1, 1))
      const tierLift = liftAtSim(sim, 1, 1, 0)
      expect(tileLiftAtSim(sim, 1, 1, 0, false)).toBe(tierLift + WATER_SINK_PX)
    })

    it('tileLiftAtSim returns liftAtSim + WATER_SINK_PX for pond tiles', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 0)
      sim.ponds.add(posKey(1, 1))
      const tierLift = liftAtSim(sim, 1, 1, 0)
      expect(tileLiftAtSim(sim, 1, 1, 0, false)).toBe(tierLift + WATER_SINK_PX)
    })

    it('tileLiftAtSim equals liftAtSim for dirt tiles (no water sink)', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 2)
      expect(tileLiftAtSim(sim, 1, 1, 0, false)).toBe(liftAtSim(sim, 1, 1, 0))
    })

    it('lowland water sinks only when includeLowland is true', () => {
      const sim = buildSim()
      // Use tier 1 so the lift is non-zero, avoiding +0/-0 strict-equality
      // ambiguity from Math operations on tier 0.
      setTier(sim, 1, 1, 1)
      sim.lowlandWaterMask.add(posKey(1, 1))
      const tierLift = liftAtSim(sim, 1, 1, 0)
      expect(tileLiftAtSim(sim, 1, 1, 0, false)).toBe(tierLift)
      expect(tileLiftAtSim(sim, 1, 1, 0, true)).toBe(tierLift + WATER_SINK_PX)
    })

    it('walls between dirt and adjacent water are taller by WATER_SINK_PX than a flat dirt-to-dirt wall', () => {
      const sim = buildSim()
      // Both tiles at tier 0. South is a river.
      setTier(sim, 1, 1, 0)
      setTier(sim, 1, 2, 0)
      sim.riverPaths.add(posKey(1, 2))
      const selfLift = tileLiftAtSim(sim, 1, 1, 0, false)
      const southLift = tileLiftAtSim(sim, 1, 2, 0, false)
      // depth = south_lift - self_lift (lifts are negative-when-up,
      // positive-when-sunk). Self at 0 lift, south sunk by WATER_SINK_PX.
      expect(Math.max(0, southLift - selfLift)).toBe(WATER_SINK_PX)
    })

    it('two water tiles at the same tier produce no wall between them', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 0)
      setTier(sim, 1, 2, 0)
      sim.riverPaths.add(posKey(1, 1))
      sim.riverPaths.add(posKey(1, 2))
      const selfLift = tileLiftAtSim(sim, 1, 1, 0, false)
      const southLift = tileLiftAtSim(sim, 1, 2, 0, false)
      expect(Math.max(0, southLift - selfLift)).toBe(0)
    })
  })

  describe('zero/negative tween duration edge case', () => {
    // TIER_TWEEN_DURATION_MS is a tunable constant. A future setting of
    // zero/negative must collapse to un-tweened behavior — covered by the
    // Math.max(0, Math.min(1, ...)) clamp in liftAtSim.
    it('clamps u to [0, 1] so the tween cannot overshoot or undershoot', () => {
      const sim = buildSim()
      setTier(sim, 1, 1, 2)
      sim.tierTweens.set(posKey(1, 1), { fromLift: getTierLift(0), toTier: 2, startMs: 1000 })
      // Time before startMs: u clamped to 0, returns fromLift
      expect(liftAtSim(sim, 1, 1, 0)).toBe(getTierLift(0))
      // Time far after: u clamped to 1, returns getTierLift(toTier)
      expect(liftAtSim(sim, 1, 1, 1_000_000)).toBe(getTierLift(2))
    })
  })
})
