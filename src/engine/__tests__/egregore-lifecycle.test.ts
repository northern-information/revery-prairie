import { describe, expect, it } from 'vitest'

import { tickEgregoreLifecycle } from '../egregore/lifecycle'
import { posKey } from '../position'
import { EgregoreActivityStage, EgregoreSpecies, Season } from '../types'

import { createTestState } from './helpers'

import type { EgregoreActivityState, GameState } from '../types'

const seedLifecycleAt = (state: GameState, x: number, y: number, stage: EgregoreActivityStage): void => {
  const entry: EgregoreActivityState = {
    stage,
    stageStartTime: 0,
    species: EgregoreSpecies.Spreader,
    genome: {
      __kind: 'egregore',
      identity: '0000000000000000000000000000000000000000000000000000000000000000',
      allelopathy: 0.5,
      spreadVelocity: 0.5,
    },
  }
  state.egregoreLifecycle.set(posKey(x, y), entry)
}

describe('tickEgregoreLifecycle — inverse-phased dormancy (RP-8b)', () => {
  it('flips Dormant entries to Active when season is Winter', () => {
    const state = createTestState()
    state.egregoreLifecycle = new Map()
    seedLifecycleAt(state, 5, 5, EgregoreActivityStage.Dormant)
    state.weather.season = Season.Winter
    tickEgregoreLifecycle(state, 1000)
    const entry = state.egregoreLifecycle.get(posKey(5, 5))
    expect(entry?.stage).toBe(EgregoreActivityStage.Active)
    expect(entry?.stageStartTime).toBe(1000)
  })

  it('flips Active entries to Dormant when season is not Winter', () => {
    const state = createTestState()
    state.egregoreLifecycle = new Map()
    seedLifecycleAt(state, 5, 5, EgregoreActivityStage.Active)
    state.weather.season = Season.Summer
    tickEgregoreLifecycle(state, 2000)
    const entry = state.egregoreLifecycle.get(posKey(5, 5))
    expect(entry?.stage).toBe(EgregoreActivityStage.Dormant)
    expect(entry?.stageStartTime).toBe(2000)
  })

  it('does not advance an already-Active entry in Winter', () => {
    const state = createTestState()
    state.egregoreLifecycle = new Map()
    seedLifecycleAt(state, 5, 5, EgregoreActivityStage.Active)
    const entry = state.egregoreLifecycle.get(posKey(5, 5))
    if (!entry) throw new Error('seed failed')
    entry.stageStartTime = 500 // already-set start time
    state.weather.season = Season.Winter
    tickEgregoreLifecycle(state, 9999)
    // stageStartTime should NOT be touched — no transition fired.
    expect(entry.stageStartTime).toBe(500)
  })

  it('does not advance an already-Dormant entry outside Winter', () => {
    const state = createTestState()
    state.egregoreLifecycle = new Map()
    seedLifecycleAt(state, 5, 5, EgregoreActivityStage.Dormant)
    const entry = state.egregoreLifecycle.get(posKey(5, 5))
    if (!entry) throw new Error('seed failed')
    entry.stageStartTime = 700
    state.weather.season = Season.Spring
    tickEgregoreLifecycle(state, 9999)
    expect(entry.stageStartTime).toBe(700)
  })

  it('no-ops with zero entries (does not throw)', () => {
    const state = createTestState()
    state.egregoreLifecycle = new Map()
    state.weather.season = Season.Winter
    expect(() => {
      tickEgregoreLifecycle(state, 0)
    }).not.toThrow()
  })

  it('converges mixed-stage entries in a single tick', () => {
    const state = createTestState()
    state.egregoreLifecycle = new Map()
    seedLifecycleAt(state, 1, 1, EgregoreActivityStage.Dormant)
    seedLifecycleAt(state, 2, 2, EgregoreActivityStage.Active)
    seedLifecycleAt(state, 3, 3, EgregoreActivityStage.Dormant)
    state.weather.season = Season.Winter
    tickEgregoreLifecycle(state, 100)
    for (const entry of state.egregoreLifecycle.values()) {
      expect(entry.stage).toBe(EgregoreActivityStage.Active)
    }
  })
})
