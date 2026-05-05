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

  it('cardinal directions have magnitude √2, ordinals have magnitude 1', () => {
    const cardinals = [WindDirection.N, WindDirection.S, WindDirection.E, WindDirection.W]
    const ordinals = [WindDirection.NE, WindDirection.SW, WindDirection.NW, WindDirection.SE]

    for (const dir of cardinals) {
      const { sx, sy } = WIND_SCREEN_VECTORS[dir]
      const mag = Math.sqrt(sx * sx + sy * sy)
      expect(mag).toBeCloseTo(Math.SQRT2, 5)
    }
    for (const dir of ordinals) {
      const { sx, sy } = WIND_SCREEN_VECTORS[dir]
      const mag = Math.sqrt(sx * sx + sy * sy)
      expect(mag).toBeCloseTo(1, 5)
    }
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
