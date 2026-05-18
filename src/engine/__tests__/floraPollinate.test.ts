import {
  emitPlayerTrailBurst,
  getFloraPollinate,
  MAX_POLLEN,
  registerFloraPollinate,
  tickPollenDrift,
  tickPollenEmit,
  unregisterFloraPollinate,
} from '../flora/actions/pollinate'
import { TileType, Zone } from '../types'
import { createTestState } from './helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FloraPollinateProfile, GameState } from '../types'

// ─── test profile ─────────────────────────────────────────────────────────────

const TEST_PROFILE: FloraPollinateProfile = {
  glyph: '.',
  color: '#b07fc7',
  parsedColor: [176, 127, 199],
  windThreshold: 8,
  emitRate: 0.15,
  minAge: 800,
  maxAge: 1400,
}

const registerTestProfile = () => {
  registerFloraPollinate(TileType.Flora, TEST_PROFILE)
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const windyState = (): GameState => {
  const state = createTestState()
  state.wind.smoothSx = 1
  state.wind.smoothSy = 0
  state.wind.smoothSpeed = 15
  state.wind.gustIntensity = 0
  state.weather.windSpeed = 15
  return state
}

afterEach(() => {
  vi.restoreAllMocks()
  unregisterFloraPollinate(TileType.Flora)
  unregisterFloraPollinate('test-pollinate')
  unregisterFloraPollinate('gated-tile')
})

describe('registerFloraPollinate / getFloraPollinate', () => {
  it('retrieves a profile that was registered', () => {
    const profile: FloraPollinateProfile = { ...TEST_PROFILE }
    registerFloraPollinate('test-pollinate', profile)
    expect(getFloraPollinate('test-pollinate')).toBe(profile)
  })

  it('returns undefined for unknown tile type', () => {
    expect(getFloraPollinate('__not_registered__')).toBeUndefined()
  })
})

describe('tickPollenDrift', () => {
  beforeEach(registerTestProfile)

  it('ages particles by dt', () => {
    const state = windyState()
    state.pollen.push({ x: 5, y: 5, age: 0, maxAge: 1000, profileId: 'clover' })

    tickPollenDrift(state, 50)
    expect(state.pollen[0].age).toBe(50)
  })

  it('removes expired particles (swap-with-last)', () => {
    const state = windyState()
    state.pollen.push({ x: 5, y: 5, age: 990, maxAge: 1000, profileId: 'clover' })
    state.pollen.push({ x: 6, y: 5, age: 0, maxAge: 1000, profileId: 'clover' })

    tickPollenDrift(state, 20) // first particle exceeds maxAge (990 + 20 = 1010 >= 1000)
    expect(state.pollen).toHaveLength(1)
  })

  it('moves particles in the wind direction', () => {
    const state = windyState()
    const p = { x: 5, y: 5, age: 0, maxAge: 1000, profileId: 'clover' }
    state.pollen.push(p)

    tickPollenDrift(state, 100)

    // Wind is in the +x screen direction (smoothSx=1, smoothSy=0),
    // so x should increase and y should be near its starting value ± wobble/turbulence.
    expect(state.pollen[0].x).toBeGreaterThan(5)
  })

  it('handles zero particles without error', () => {
    const state = windyState()
    expect(() => {
      tickPollenDrift(state, 16)
    }).not.toThrow()
  })

  it('skips drift computation when wind is effectively zero', () => {
    const state = createTestState()
    state.wind.smoothSpeed = 0
    state.wind.gustIntensity = 0

    const p = { x: 5, y: 5, age: 0, maxAge: 1000, profileId: 'clover' }
    state.pollen.push(p)

    tickPollenDrift(state, 16)

    // Particle should stay at x=5 (no drift when wind is zero)
    expect(state.pollen[0].x).toBe(5)
  })
})

describe('tickPollenEmit', () => {
  beforeEach(registerTestProfile)

  it('does not emit outside overworld', () => {
    const state = windyState()
    state.currentZone = Zone.Cave

    // Set camera to see the viewport (no real tiles matter here, just no crash)
    tickPollenEmit(state, 100)
    expect(state.pollen).toHaveLength(0)
  })

  it('does not emit when wind speed is at or below threshold', () => {
    const state = windyState()
    state.wind.smoothSpeed = 0
    state.wind.gustIntensity = 0
    // totalSpeed = 0 + 0 = 0 ≤ windThreshold of 8

    // Force emission probability to 1 so any eligible tile emits
    vi.spyOn(Math, 'random').mockReturnValue(0)

    tickPollenEmit(state, 100)
    expect(state.pollen).toHaveLength(0)
  })

  it('respects MAX_POLLEN cap', () => {
    const state = windyState()
    // Fill pollen to the cap
    for (let i = 0; i < MAX_POLLEN; i++) {
      state.pollen.push({ x: 0, y: 0, age: 0, maxAge: 1000, profileId: 'clover' })
    }

    vi.spyOn(Math, 'random').mockReturnValue(0) // always emit
    tickPollenEmit(state, 100)
    expect(state.pollen.length).toBeLessThanOrEqual(MAX_POLLEN)
  })

  it('calls emitGate and suppresses emission when gate returns false', () => {
    const state = windyState()
    state.wind.smoothSpeed = 20
    state.wind.gustIntensity = 0
    const profileWithGate: FloraPollinateProfile = { ...TEST_PROFILE, emitGate: () => false }
    registerFloraPollinate('gated-tile', profileWithGate)

    // Place a gated tile in the viewport
    const row = state.map[state.camera.y]
    if (row) row[state.camera.x] = { type: 'gated-tile' as never }
    vi.spyOn(Math, 'random').mockReturnValue(0) // always emit if gate passes

    tickPollenEmit(state, 100)
    expect(state.pollen).toHaveLength(0)
  })
})

describe('emitPlayerTrailBurst', () => {
  beforeEach(registerTestProfile)

  it('spawns 5 + min(depth, 8) particles', () => {
    const state = windyState()
    state.pollenTrailDepth = 3

    emitPlayerTrailBurst(state, state.player.x, state.player.y, TileType.Flora)

    expect(state.pollen).toHaveLength(5 + 3)
  })

  it('resets pollenTrailDepth to 0', () => {
    const state = windyState()
    state.pollenTrailDepth = 5

    emitPlayerTrailBurst(state, state.player.x, state.player.y, TileType.Flora)

    expect(state.pollenTrailDepth).toBe(0)
  })

  it('burst minimum is 5 when depth is 0', () => {
    const state = windyState()
    state.pollenTrailDepth = 0

    emitPlayerTrailBurst(state, state.player.x, state.player.y, TileType.Flora)

    expect(state.pollen).toHaveLength(5)
  })

  it('caps burst at 13 when depth is large (5 + min(8, 8) = 13)', () => {
    const state = windyState()
    state.pollenTrailDepth = 8

    emitPlayerTrailBurst(state, state.player.x, state.player.y, TileType.Flora)

    expect(state.pollen).toHaveLength(13)
  })

  it('respects MAX_POLLEN cap', () => {
    const state = windyState()
    for (let i = 0; i < MAX_POLLEN - 1; i++) {
      state.pollen.push({ x: 0, y: 0, age: 0, maxAge: 1000, profileId: 'clover' })
    }
    state.pollenTrailDepth = 8

    emitPlayerTrailBurst(state, state.player.x, state.player.y, TileType.Flora)

    expect(state.pollen.length).toBeLessThanOrEqual(MAX_POLLEN)
  })

  it('does nothing for an unregistered tile type', () => {
    const state = windyState()
    state.pollenTrailDepth = 5

    emitPlayerTrailBurst(state, state.player.x, state.player.y, 'sand')

    expect(state.pollen).toHaveLength(0)
    // pollenTrailDepth should be untouched — no matching profile
    expect(state.pollenTrailDepth).toBe(5)
  })
})
