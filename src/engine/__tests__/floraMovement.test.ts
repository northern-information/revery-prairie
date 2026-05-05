import {
  getFloraMovement,
  getFloraSwayOffset,
  registerFloraMovement,
  unregisterFloraMovement,
} from '../flora/actions/movement'
import { Zone } from '../types'
import { createTestState } from './helpers'
import { afterEach, describe, expect, it } from 'vitest'

import type { FloraMovementProfile } from '../flora/actions/movement'

// ─── test profile ─────────────────────────────────────────────────────────────

const TEST_PROFILE: FloraMovementProfile = {
  baseFreqMs: 0.0015,
  windFreqFactor: 0.0025,
  waveKA: 0.3,
  waveKB: 0.15,
  leanFraction: 0.6,
  dxFraction: 0.1,
  dyFraction: 0.28,
  swayFactors: {
    healthy: 1.0,
    brown: 0.5,
    dead: 0.0,
  },
}

afterEach(() => {
  unregisterFloraMovement('test-flora-movement')
})

describe('registerFloraMovement / getFloraMovement', () => {
  it('retrieves a profile that was registered', () => {
    registerFloraMovement('test-flora-movement', TEST_PROFILE)
    expect(getFloraMovement('test-flora-movement')).toBe(TEST_PROFILE)
  })

  it('returns undefined for an unknown tile type', () => {
    expect(getFloraMovement('__not_registered__')).toBeUndefined()
  })
})

describe('getFloraSwayOffset', () => {
  const baseState = () => {
    const state = createTestState()
    // Give the wind enough speed to trigger sway
    state.wind.smoothSx = 1
    state.wind.smoothSy = 0
    state.wind.smoothSpeed = 15
    state.wind.gustIntensity = 0
    return state
  }

  it('returns zero offset in cave zone', () => {
    const state = baseState()
    const result = getFloraSwayOffset(TEST_PROFILE, state, 5, 5, 1000, Zone.Cave, 'healthy', 8, 16, '#50c878')
    expect(result.dx).toBe(0)
    expect(result.dy).toBe(0)
    expect(result.color).toBe('#50c878')
  })

  it('returns zero offset in ruin zone', () => {
    const state = baseState()
    const result = getFloraSwayOffset(TEST_PROFILE, state, 5, 5, 1000, Zone.Ruin, 'healthy', 8, 16, '#50c878')
    expect(result.dx).toBe(0)
    expect(result.dy).toBe(0)
  })

  it('returns zero offset when swayFactor is 0 (dead stage)', () => {
    const state = baseState()
    const result = getFloraSwayOffset(TEST_PROFILE, state, 5, 5, 1000, Zone.Overworld, 'dead', 8, 16, '#50c878')
    expect(result.dx).toBe(0)
    expect(result.dy).toBe(0)
  })

  it('returns zero offset when wind speed is effectively zero', () => {
    const state = createTestState()
    state.wind.smoothSx = 0
    state.wind.smoothSy = 0
    state.wind.smoothSpeed = 0
    state.wind.gustIntensity = 0

    const result = getFloraSwayOffset(TEST_PROFILE, state, 5, 5, 1000, Zone.Overworld, 'healthy', 8, 16, '#50c878')
    expect(result.dx).toBe(0)
    expect(result.dy).toBe(0)
  })

  it('returns non-zero dx/dy in overworld with wind', () => {
    const state = baseState()
    // Run multiple time values to avoid a zero-crossing accident
    let nonZeroFound = false
    for (let t = 100; t <= 2000; t += 100) {
      const result = getFloraSwayOffset(TEST_PROFILE, state, 5, 5, t, Zone.Overworld, 'healthy', 8, 16, '#50c878')
      if (result.dx !== 0 || result.dy !== 0) {
        nonZeroFound = true
        break
      }
    }
    expect(nonZeroFound).toBe(true)
  })

  it('scales sway by swayFactor (brown = 0.5 vs healthy = 1.0)', () => {
    const state = baseState()
    const time = 500

    const healthy = getFloraSwayOffset(TEST_PROFILE, state, 5, 5, time, Zone.Overworld, 'healthy', 8, 16, '#50c878')
    const brown = getFloraSwayOffset(TEST_PROFILE, state, 5, 5, time, Zone.Overworld, 'brown', 8, 16, '#50c878')

    // Brown should be exactly half of healthy (same sway computation, 0.5× factor)
    expect(brown.dx).toBeCloseTo(healthy.dx * 0.5, 10)
    expect(brown.dy).toBeCloseTo(healthy.dy * 0.5, 10)
  })

  it('applies full sway when lifecycleStage is undefined (missing = 1.0)', () => {
    const state = baseState()
    const time = 500

    const withStage = getFloraSwayOffset(TEST_PROFILE, state, 5, 5, time, Zone.Overworld, 'healthy', 8, 16, '#50c878')
    const noStage = getFloraSwayOffset(TEST_PROFILE, state, 5, 5, time, Zone.Overworld, undefined, 8, 16, '#50c878')
    expect(noStage.dx).toBeCloseTo(withStage.dx, 10)
    expect(noStage.dy).toBeCloseTo(withStage.dy, 10)
  })
})
