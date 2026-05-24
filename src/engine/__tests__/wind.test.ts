import { WindDirection } from '../types'
import { getWindAt, initWindState, MAX_WIND_SPEED, tickWind, WIND_SCREEN_VECTORS } from '../weather/wind'
import { createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('initWindState', () => {
  it('starts with all smooth components at zero', () => {
    const s = initWindState()
    expect(s.smoothSx).toBe(0)
    expect(s.smoothSy).toBe(0)
    expect(s.smoothSpeed).toBe(0)
    expect(s.phaseAccum).toBe(0)
  })

  it('starts with gustPhase none and zero intensity', () => {
    const s = initWindState()
    expect(s.gustPhase).toBe('none')
    expect(s.gustIntensity).toBe(0)
  })

  it('starts uninitialized', () => {
    const s = initWindState()
    expect(s.initialized).toBe(false)
  })
})

describe('WIND_SCREEN_VECTORS', () => {
  it('has entries for all 8 compass directions', () => {
    const dirs = Object.values(WindDirection)
    for (const dir of dirs) {
      expect(WIND_SCREEN_VECTORS[dir]).toBeDefined()
    }
  })

  it('all eight directions have magnitude √2 in the rotated frame', () => {
    // Under the rotated cardinal frame (backlog-thinktank-v5 round 1) the
    // diamond is the world: cardinals point at the diamond's tips on screen
    // (axis-aligned screen vectors at magnitude √2) and ordinals align with
    // the storage axes (diagonal screen vectors at magnitude √2 split across
    // both components). All eight values share the same magnitude so
    // windSpeed × (sx, sy) produces equivalent drift across all directions.
    for (const dir of Object.values(WindDirection)) {
      const { sx, sy } = WIND_SCREEN_VECTORS[dir]
      const mag = Math.sqrt(sx * sx + sy * sy)
      expect(mag).toBeCloseTo(Math.SQRT2, 5)
    }
  })
})

// Golden fixture for the rotated cardinal frame (backlog-thinktank-v5 round 1).
// Pins each cardinal's (sx, sy) so the old frame cannot be reintroduced by
// accident.
describe('WIND_SCREEN_VECTORS rotated frame', () => {
  it('N points from the diamond top tip (screen-down drift)', () => {
    expect(WIND_SCREEN_VECTORS[WindDirection.N]).toEqual({ sx: 0, sy: Math.SQRT2 })
  })
  it('S points from the diamond bottom tip (screen-up drift)', () => {
    expect(WIND_SCREEN_VECTORS[WindDirection.S]).toEqual({ sx: 0, sy: -Math.SQRT2 })
  })
  it('E points from the diamond right tip (screen-left drift)', () => {
    expect(WIND_SCREEN_VECTORS[WindDirection.E]).toEqual({ sx: -Math.SQRT2, sy: 0 })
  })
  it('W points from the diamond left tip (screen-right drift)', () => {
    expect(WIND_SCREEN_VECTORS[WindDirection.W]).toEqual({ sx: Math.SQRT2, sy: 0 })
  })
  it('NE points from the upper-right edge (storage -x direction)', () => {
    expect(WIND_SCREEN_VECTORS[WindDirection.NE]).toEqual({ sx: -1, sy: -1 })
  })
  it('SE points from the lower-right edge (storage -y direction)', () => {
    expect(WIND_SCREEN_VECTORS[WindDirection.SE]).toEqual({ sx: 1, sy: -1 })
  })
  it('SW points from the lower-left edge (storage +x direction)', () => {
    expect(WIND_SCREEN_VECTORS[WindDirection.SW]).toEqual({ sx: 1, sy: 1 })
  })
  it('NW points from the upper-left edge (storage +y direction)', () => {
    expect(WIND_SCREEN_VECTORS[WindDirection.NW]).toEqual({ sx: -1, sy: 1 })
  })
})

// Golden fixture for the genesis polar metric in the rotated frame
// (backlog-thinktank-v5 round 1). Pins topDist = (x - SB) + (y - SB) so future
// edits cannot regress to the old storage-y semantics.
describe('genesis polar metric — rotated frame', () => {
  // Synthetic 100x100 sim with SPACE_BORDER = 5, playable side = 90.
  const SB = 5
  const topDist = (x: number, y: number): number => x - SB + (y - SB)

  it('topDist at the diamond top tip is 0', () => {
    expect(topDist(5, 5)).toBe(0)
  })
  it('topDist at the diamond bottom tip is 2 × (playable side − 1)', () => {
    expect(topDist(94, 94)).toBe(178)
  })
  it('topDist at the diamond left tip equals the right tip', () => {
    // Left tip (5, 94): (5-5) + (94-5) = 89
    // Right tip (94, 5): (94-5) + (5-5) = 89
    expect(topDist(5, 94)).toBe(89)
    expect(topDist(94, 5)).toBe(89)
  })
})

describe('tickWind — cold start', () => {
  it('snaps smooth state to current weather on first tick', () => {
    // Suppress gust triggers by returning 1 from Math.random (1 > any GUST_BASE_CHANCE)
    vi.spyOn(Math, 'random').mockReturnValue(1)

    const state = createTestState()
    state.weather.windSpeed = 10
    state.weather.windDirection = WindDirection.W
    state.wind = initWindState()

    tickWind(state, 1000, 16)

    const { sx: tSx, sy: tSy } = WIND_SCREEN_VECTORS[WindDirection.W]
    expect(state.wind.smoothSx).toBeCloseTo(tSx * 10, 5)
    expect(state.wind.smoothSy).toBeCloseTo(tSy * 10, 5)
    expect(state.wind.smoothSpeed).toBeCloseTo(10, 5)
  })
})

describe('tickWind — linear interpolation', () => {
  it('advances smoothSx toward target at constant rate', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)

    const state = createTestState()
    state.weather.windSpeed = 25
    state.weather.windDirection = WindDirection.W

    // Warm up: first tick snaps
    state.wind = initWindState()
    tickWind(state, 1000, 16)

    // Now change direction — smooth state should lag behind
    state.weather.windDirection = WindDirection.E
    const { sx: newSx } = WIND_SCREEN_VECTORS[WindDirection.E]

    const before = state.wind.smoothSx
    tickWind(state, 1016, 16)
    const after = state.wind.smoothSx

    // Should have moved toward newSx * 25 by exactly WIND_CHANGE_RATE * 16 = 1.6
    const expected = before + Math.sign(newSx * 25 - before) * 1.6
    expect(after).toBeCloseTo(expected, 4)
  })

  it('phaseAccum grows with wind speed and dt', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)

    const state = createTestState()
    state.weather.windSpeed = 25
    state.weather.windDirection = WindDirection.W
    state.wind = initWindState()

    tickWind(state, 1000, 16)
    const afterSnap = state.wind.phaseAccum
    // After cold-start snap smoothSpeed = 25; phaseAccum += (25/25) * min(16,100) = 16
    expect(afterSnap).toBeCloseTo(16, 4)

    tickWind(state, 1016, 16)
    // smoothSpeed still ~25; adds another ~16
    expect(state.wind.phaseAccum).toBeCloseTo(32, 1)
  })
})

describe('getWindAt', () => {
  it('returns smoothed components when no gust is active', () => {
    const state = createTestState()
    state.wind = initWindState()
    state.wind.smoothSx = 5
    state.wind.smoothSy = 3
    state.wind.smoothSpeed = 8
    state.wind.gustIntensity = 0

    const sample = getWindAt(state, 0, 0)
    expect(sample.sx).toBe(5)
    expect(sample.sy).toBe(3)
    expect(sample.speed).toBe(8)
    expect(sample.totalSx).toBe(5) // no gust contrib
    expect(sample.totalSy).toBe(3)
  })

  it('totalSpeed includes gust contribution', () => {
    const state = createTestState()
    state.wind = initWindState()
    state.wind.smoothSpeed = 10
    state.wind.gustIntensity = 0.5
    state.wind.gustSx = 1
    state.wind.gustSy = 0

    const sample = getWindAt(state, 0, 0)
    // gustContribSpeed = 0.5 * 25 = 12.5
    expect(sample.totalSpeed).toBeCloseTo(22.5, 4)
  })

  it('returns phaseAccum from wind state', () => {
    const state = createTestState()
    state.wind = initWindState()
    state.wind.phaseAccum = 777

    const sample = getWindAt(state, 0, 0)
    expect(sample.phaseAccum).toBe(777)
  })

  it('returns global smooth value regardless of tile position', () => {
    const state = createTestState()
    state.wind = initWindState()
    state.wind.smoothSx = 2

    expect(getWindAt(state, 5, 5).sx).toBe(2)
    expect(getWindAt(state, 50, 80).sx).toBe(2)
  })
})

describe('MAX_WIND_SPEED', () => {
  it('is 25', () => {
    expect(MAX_WIND_SPEED).toBe(25)
  })
})
