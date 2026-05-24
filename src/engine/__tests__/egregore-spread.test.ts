import { describe, expect, it } from 'vitest'

import { SEASONAL_PHASE_PERIOD_MS } from '../constants'
import { tickEgregoreSpread } from '../egregore/spread'
import { posKey } from '../position'
import { OmenKind, ReveryPhase, Season, TileType, Zone } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

import type { GameState } from '../types'

const seedEgregoreAt = (state: GameState, x: number, y: number): void => {
  state.map[y][x] = { type: TileType.Egregore }
  state.egregorePositions.push({ x, y })
}

const winterTime = SEASONAL_PHASE_PERIOD_MS * 3 // any time past year 2

const setupWinterOverworld = (state: GameState): void => {
  state.weather.season = Season.Winter
  state.currentZone = Zone.Overworld
  state.deepTime = null
  state.revery = null
  state.egregorePositions = []
  state.egregoreLifecycle = new Map()
  state.lastEgregoreSpreadYear = -1
  state.pollen = []
  clearAroundPlayer(state, 6)
}

describe('tickEgregoreSpread — gating (RP-8b)', () => {
  it('does not spread when season is not Winter', () => {
    const state = createTestState()
    setupWinterOverworld(state)
    state.weather.season = Season.Spring
    seedEgregoreAt(state, state.player.x + 3, state.player.y + 3)
    const before = state.egregorePositions.length
    tickEgregoreSpread(state, winterTime)
    expect(state.egregorePositions.length).toBe(before)
    expect(state.lastEgregoreSpreadYear).toBe(-1)
  })

  it('does not spread in cave', () => {
    const state = createTestState()
    setupWinterOverworld(state)
    state.currentZone = Zone.Cave
    seedEgregoreAt(state, state.player.x + 3, state.player.y + 3)
    const before = state.egregorePositions.length
    tickEgregoreSpread(state, winterTime)
    expect(state.egregorePositions.length).toBe(before)
    expect(state.lastEgregoreSpreadYear).toBe(-1)
  })

  it('does not spread while a Revery is active', () => {
    const state = createTestState()
    setupWinterOverworld(state)
    state.revery = {
      active: true,
      startTime: 0,
      phase: ReveryPhase.Observing,
      elapsedYears: 0,
      snapshotBeforeRevery: {
        floraCounts: { clover: 0, wildflower: 0, tallGrass: 0 },
        egregoreCount: 0,
        season: Season.Winter,
        reveryCount: 0,
      },
      scheduledChanges: [],
      summaryReady: false,
      omenKind: OmenKind.BeeOnShoulder,
    }
    seedEgregoreAt(state, state.player.x + 3, state.player.y + 3)
    const before = state.egregorePositions.length
    tickEgregoreSpread(state, winterTime)
    expect(state.egregorePositions.length).toBe(before)
    expect(state.lastEgregoreSpreadYear).toBe(-1)
  })

  it('does not spread while deep time is active', () => {
    const state = createTestState()
    setupWinterOverworld(state)
    state.deepTime = { phase: 'transitioning', startTime: 0, yearsElapsed: 0 } as unknown as GameState['deepTime']
    seedEgregoreAt(state, state.player.x + 3, state.player.y + 3)
    const before = state.egregorePositions.length
    tickEgregoreSpread(state, winterTime)
    expect(state.egregorePositions.length).toBe(before)
    expect(state.lastEgregoreSpreadYear).toBe(-1)
  })
})

describe('tickEgregoreSpread — throttle (RP-8b)', () => {
  it('spreads at most once per in-game year', () => {
    const state = createTestState()
    setupWinterOverworld(state)
    seedEgregoreAt(state, state.player.x + 3, state.player.y + 3)
    const t = winterTime
    tickEgregoreSpread(state, t)
    const afterFirst = state.egregorePositions.length
    expect(afterFirst).toBeGreaterThan(1)
    tickEgregoreSpread(state, t + 1000) // same year
    expect(state.egregorePositions.length).toBe(afterFirst)
  })

  it('spreads again in the next year', () => {
    const state = createTestState()
    setupWinterOverworld(state)
    seedEgregoreAt(state, state.player.x + 3, state.player.y + 3)
    tickEgregoreSpread(state, winterTime)
    const afterFirst = state.egregorePositions.length
    tickEgregoreSpread(state, winterTime + SEASONAL_PHASE_PERIOD_MS)
    expect(state.egregorePositions.length).toBeGreaterThan(afterFirst)
  })
})

describe('tickEgregoreSpread — placement (RP-8b)', () => {
  it('places 1 or 2 tiles per spread', () => {
    const state = createTestState()
    setupWinterOverworld(state)
    seedEgregoreAt(state, state.player.x + 3, state.player.y + 3)
    tickEgregoreSpread(state, winterTime)
    // egregorePositions includes the seed (1) + 1–2 placed (1 or 2).
    expect(state.egregorePositions.length).toBeGreaterThanOrEqual(2)
    expect(state.egregorePositions.length).toBeLessThanOrEqual(3)
  })

  it('seeds an egregoreLifecycle entry for every freshly placed tile', () => {
    const state = createTestState()
    setupWinterOverworld(state)
    const seedX = state.player.x + 3
    const seedY = state.player.y + 3
    seedEgregoreAt(state, seedX, seedY)
    const before = state.egregorePositions.length
    tickEgregoreSpread(state, winterTime)
    // Only assert lifecycle entries for positions placed by the spread
    // tick — the test's manual seed does not get a lifecycle entry.
    const placed = state.egregorePositions.slice(before)
    expect(placed.length).toBeGreaterThan(0)
    for (const pos of placed) {
      expect(state.egregoreLifecycle.has(posKey(pos.x, pos.y))).toBe(true)
    }
  })

  it('consumes a year slot even when no candidates exist', () => {
    const state = createTestState()
    setupWinterOverworld(state)
    // Seed an egregore tile with NO dirt neighbors — surround it with
    // other egregore tiles so candidateDirtNeighbors returns empty.
    const ex = state.player.x + 4
    const ey = state.player.y + 4
    seedEgregoreAt(state, ex, ey)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        state.map[ey + dy][ex + dx] = { type: TileType.Egregore }
      }
    }
    tickEgregoreSpread(state, winterTime)
    expect(state.lastEgregoreSpreadYear).toBe(Math.floor(winterTime / SEASONAL_PHASE_PERIOD_MS))
  })
})

describe('tickEgregoreSpread — invisible pollinator (RP-8b)', () => {
  it('does not spawn any pollen particles', () => {
    const state = createTestState()
    setupWinterOverworld(state)
    seedEgregoreAt(state, state.player.x + 3, state.player.y + 3)
    const pollenBefore = state.pollen.length
    tickEgregoreSpread(state, winterTime)
    expect(state.pollen.length).toBe(pollenBefore)
  })
})
