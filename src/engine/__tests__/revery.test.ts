import { describe, expect, it } from 'vitest'

import { REVERY_YEARS_PER_FRAME } from '../constants'
import { movePlayer } from '../movement'
import {
  advanceReveryToClosing,
  initiateRevery,
  isReveryLocked,
  takeReverySnapshot,
  tickRevery,
} from '../revery'
import { OmenKind, ReveryPhase, Season } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

describe('isReveryLocked (precis #4)', () => {
  it('returns false when state.revery is null', () => {
    const state = createTestState()
    expect(isReveryLocked(state)).toBe(false)
  })

  it('returns true during Observing', () => {
    const state = createTestState()
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1000) // Omen → Observing
    expect(state.revery?.phase).toBe(ReveryPhase.Observing)
    expect(isReveryLocked(state)).toBe(true)
  })

  it('returns false during Closing (one-frame transition)', () => {
    const state = createTestState()
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1000) // Omen → Observing
    // Force Summary directly to test Closing transition
    if (state.revery) state.revery.phase = ReveryPhase.Summary
    advanceReveryToClosing(state)
    expect(state.revery?.phase).toBe(ReveryPhase.Closing)
    expect(isReveryLocked(state)).toBe(false)
  })
})

describe('initiateRevery (precis #4)', () => {
  it('transitions null → Omen with snapshot captured', () => {
    const state = createTestState()
    initiateRevery(state, 5000, OmenKind.DistantMeteorite)
    expect(state.revery?.phase).toBe(ReveryPhase.Omen)
    expect(state.revery?.omenKind).toBe(OmenKind.DistantMeteorite)
    expect(state.revery?.startTime).toBe(5000)
    expect(state.revery?.snapshotBeforeRevery).toBeDefined()
  })

  it('clears state.path and pendingAction on entry', () => {
    const state = createTestState()
    state.path = [{ x: 1, y: 1 }]
    state.pathWaypoints = [{ x: 1, y: 1 }]
    state.pendingAction = () => {
      // noop — testing that initiateRevery clears the field
    }
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    expect(state.path).toBeNull()
    expect(state.pathWaypoints).toEqual([])
    expect(state.pendingAction).toBeNull()
  })

  it('is a no-op when a Revery is already active', () => {
    const state = createTestState()
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    const before = state.revery
    initiateRevery(state, 2000, OmenKind.CloudPassingSun)
    expect(state.revery).toBe(before)
    expect(state.revery?.omenKind).toBe(OmenKind.BeeOnShoulder)
  })
})

describe('tickRevery (precis #4)', () => {
  it('Omen → Observing on next frame', () => {
    const state = createTestState()
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    expect(state.revery?.phase).toBe(ReveryPhase.Omen)
    tickRevery(state, 0, 1100)
    expect(state.revery?.phase).toBe(ReveryPhase.Observing)
  })

  it('Observing accumulates elapsedYears at REVERY_YEARS_PER_FRAME', () => {
    const state = createTestState()
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100) // → Observing
    tickRevery(state, 0, 1200)
    expect(state.revery?.elapsedYears).toBeCloseTo(REVERY_YEARS_PER_FRAME, 6)
  })

  it('Observing → Summary at year completion', () => {
    const state = createTestState()
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100) // → Observing
    // 1.0 / 0.005 = 200 frames to cross the year boundary
    for (let i = 0; i < 250; i++) tickRevery(state, 0, 2000 + i)
    expect(state.revery?.phase).toBe(ReveryPhase.Summary)
    expect(state.revery?.summaryReady).toBe(true)
  })

  it('Closing increments reveryCount and clears state.revery', () => {
    const state = createTestState()
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100) // → Observing
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, 5000)
    expect(state.revery).toBeNull()
    expect(state.reveryCount).toBe(1)
    expect(state.lastReveryEndTime).toBe(5000)
  })
})

describe('movePlayer is blocked during the Revery (precis #4)', () => {
  it('returns false during Observing', () => {
    const state = createTestState()
    clearAroundPlayer(state, 3)
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100) // → Observing
    expect(movePlayer(state, 'right')).toBe(false)
  })

  it('returns true after the Revery ends (state.revery is null)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 3)
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100) // → Observing
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, 5000) // → null
    expect(movePlayer(state, 'right')).toBe(true)
  })
})

describe('takeReverySnapshot (precis #4)', () => {
  it('captures per-species flora counts + egregore count + season', () => {
    const state = createTestState()
    state.weather.season = Season.Autumn
    const snap = takeReverySnapshot(state)
    expect(snap.season).toBe(Season.Autumn)
    expect(snap.reveryCount).toBe(state.reveryCount)
    expect(snap.egregoreCount).toBe(state.egregorePositions.length)
  })
})
