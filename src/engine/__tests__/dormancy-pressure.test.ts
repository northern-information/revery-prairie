import { REVERY_COOLDOWN_MS, REVERY_PRESSURE_RAMP_END, REVERY_PRESSURE_RAMP_START } from '../constants'
import { contributeDormancyPressure, tickDormancyPressure } from '../omen'
import { OmenKind, ReveryPhase, Season, Sky, Zone } from '../types'
import { createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState, ReverySnapshot } from '../types'

// RP-32 — dormancy pressure tests.
//
// Covers the linear ramp from autumn equinox (seasonalPhase 0.5) to winter
// solstice (seasonalPhase 0.75), the gate logic (no active Revery, no deep
// time, Overworld zone, Autumn season, cooldown elapsed), and the
// contributeDormancyPressure entry point's clamping.

const setRampReady = (state: GameState): void => {
  state.weather.season = Season.Autumn
  state.currentZone = Zone.Overworld
  state.lastReveryEndTime = -REVERY_COOLDOWN_MS
}

describe('tickDormancyPressure — linear ramp floor (RP-32)', () => {
  it('floor is 0 at the autumn equinox (seasonalPhase = 0.5)', () => {
    const state = createTestState()
    setRampReady(state)
    state.seasonalPhase = REVERY_PRESSURE_RAMP_START
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBe(0)
  })

  it('floor is 0.5 halfway through the ramp (seasonalPhase = 0.625)', () => {
    const state = createTestState()
    setRampReady(state)
    const mid = (REVERY_PRESSURE_RAMP_START + REVERY_PRESSURE_RAMP_END) / 2
    state.seasonalPhase = mid
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBeCloseTo(0.5, 5)
  })

  it('floor is 1 at the winter solstice (seasonalPhase = 0.75)', () => {
    const state = createTestState()
    setRampReady(state)
    state.seasonalPhase = REVERY_PRESSURE_RAMP_END
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBe(1)
  })

  it('floor is 0 before the ramp window (seasonalPhase < 0.5)', () => {
    const state = createTestState()
    setRampReady(state)
    state.seasonalPhase = 0.4
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBe(0)
  })

  it('floor is clamped to 1 past the ramp window (seasonalPhase > 0.75)', () => {
    const state = createTestState()
    setRampReady(state)
    state.seasonalPhase = 0.9
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBe(1)
  })

  it('pressure is monotonically non-decreasing within an autumn', () => {
    const state = createTestState()
    setRampReady(state)
    state.seasonalPhase = 0.625
    tickDormancyPressure(state, 60_000)
    const mid = state.dormancyPressure
    // simulate the seasonalPhase rewinding (shouldn't happen, but the
    // function must take max(prior, floor) so a regression doesn't
    // surreptitiously drop the pressure)
    state.seasonalPhase = 0.55
    tickDormancyPressure(state, 70_000)
    expect(state.dormancyPressure).toBe(mid)
  })
})

describe('tickDormancyPressure — gates (RP-32)', () => {
  it('skips when a Revery is already active', () => {
    const state = createTestState()
    setRampReady(state)
    state.seasonalPhase = REVERY_PRESSURE_RAMP_END
    state.revery = {
      active: true,
      startTime: 0,
      phase: ReveryPhase.Observing,
      elapsedYears: 0,
      snapshotBeforeRevery: {} as ReverySnapshot,
      scheduledChanges: [],
      summaryReady: false,
      omenKind: OmenKind.CloudPassingSun,
    }
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBe(0)
  })

  it('skips when deepTime is active', () => {
    const state = createTestState()
    setRampReady(state)
    state.seasonalPhase = REVERY_PRESSURE_RAMP_END
    state.deepTime = {
      active: true,
      phase: 'burning',
      elapsedYears: 0,
      startTime: 0,
      shakeAmplitude: 0,
      strikesScheduled: [],
    } as unknown as GameState['deepTime']
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBe(0)
  })

  it('skips when zone is not Overworld', () => {
    const state = createTestState()
    setRampReady(state)
    state.currentZone = Zone.Cave
    state.seasonalPhase = REVERY_PRESSURE_RAMP_END
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBe(0)
  })

  it('skips when season is not Autumn', () => {
    const state = createTestState()
    setRampReady(state)
    state.weather.season = Season.Summer
    state.seasonalPhase = REVERY_PRESSURE_RAMP_END
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBe(0)
  })

  it('skips when the cooldown has not elapsed since the last Revery', () => {
    const state = createTestState()
    setRampReady(state)
    state.seasonalPhase = REVERY_PRESSURE_RAMP_END
    state.lastReveryEndTime = 60_000 - REVERY_COOLDOWN_MS / 2
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBe(0)
  })
})

describe('contributeDormancyPressure (RP-32)', () => {
  it('adds the amount and clamps to 1', () => {
    const state = createTestState()
    state.dormancyPressure = 0.4
    contributeDormancyPressure(state, 0.3)
    expect(state.dormancyPressure).toBeCloseTo(0.7, 5)
    contributeDormancyPressure(state, 0.5)
    expect(state.dormancyPressure).toBe(1)
  })

  it('clamps negative contributions to 0 before addition (no-op)', () => {
    const state = createTestState()
    state.dormancyPressure = 0.5
    contributeDormancyPressure(state, -0.3)
    expect(state.dormancyPressure).toBe(0.5)
  })

  it('handles a zero contribution as a no-op', () => {
    const state = createTestState()
    state.dormancyPressure = 0.5
    contributeDormancyPressure(state, 0)
    expect(state.dormancyPressure).toBe(0.5)
  })

  it('keeps the cumulative result clamped when added to an already-ceiling pressure', () => {
    const state = createTestState()
    state.dormancyPressure = 1
    contributeDormancyPressure(state, 0.5)
    expect(state.dormancyPressure).toBe(1)
  })
})

describe('createGameState — dormancyPressure initialization (RP-32)', () => {
  it('initializes dormancyPressure to 0', () => {
    const state = createTestState()
    expect(state.dormancyPressure).toBe(0)
  })

  it('initializes collapsedStewardTile to null', () => {
    const state = createTestState()
    expect(state.collapsedStewardTile).toBeNull()
  })

  it('does not initialize ReveryState.summons (field is optional)', () => {
    const state = createTestState()
    expect(state.revery).toBeNull()
    // confirm the legacy Sky field still defaults correctly
    expect(state.lastSky).toBe(Sky.Sun)
  })
})
