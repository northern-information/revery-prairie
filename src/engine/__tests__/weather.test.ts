import { RAIN_FADE_DURATION_MS, SEASONAL_PHASE_PERIOD_MS } from '../constants'
import { applySeasonalWash, SEASON_WASH_ANCHORS, seasonalWash } from '../tileBg'
import { Season, Sky, Zone } from '../types'
import {
  deriveSeason,
  fToC,
  generateWeather,
  mphToKph,
  phaseToDate,
  tickPrecipitationIntensity,
  tickWeather,
} from '../weather'
import { createTestState } from './helpers'

import type { GameState } from '../types'

describe('generateWeather', () => {
  it('returns weather with a valid season', () => {
    const weather = generateWeather()
    expect([Season.Spring, Season.Summer, Season.Autumn, Season.Winter]).toContain(weather.season)
  })

  it('returns temperature within operational range', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(weather.temperatureF).toBeGreaterThanOrEqual(-5)
      expect(weather.temperatureF).toBeLessThanOrEqual(95)
    }
  })

  it('returns wind speed within operational range', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(weather.windSpeed).toBeGreaterThanOrEqual(1)
      expect(weather.windSpeed).toBeLessThanOrEqual(30)
    }
  })

  it('returns humidity within operational range', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(weather.humidity).toBeGreaterThanOrEqual(30)
      expect(weather.humidity).toBeLessThanOrEqual(95)
    }
  })

  it('returns a valid sky condition', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect([Sky.Sun, Sky.Cloudy, Sky.Rain, Sky.Snow]).toContain(weather.sky)
    }
  })

  it('returns a valid wind direction', () => {
    const validDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(validDirections).toContain(weather.windDirection)
    }
  })
})

describe('tickWeather', () => {
  it('keeps temperature within operational range after many ticks', () => {
    const state = createTestState()
    for (let i = 0; i < 200; i++) {
      tickWeather(state, 5000)
      expect(state.weather.temperatureF).toBeGreaterThanOrEqual(-5)
      expect(state.weather.temperatureF).toBeLessThanOrEqual(95)
    }
  })

  it('keeps humidity within operational range after many ticks', () => {
    const state = createTestState()
    for (let i = 0; i < 200; i++) {
      tickWeather(state, 5000)
      expect(state.weather.humidity).toBeGreaterThanOrEqual(30)
      expect(state.weather.humidity).toBeLessThanOrEqual(95)
    }
  })

  it('keeps wind speed within operational range after many ticks', () => {
    const state = createTestState()
    for (let i = 0; i < 200; i++) {
      tickWeather(state, 5000)
      expect(state.weather.windSpeed).toBeGreaterThanOrEqual(1)
      expect(state.weather.windSpeed).toBeLessThanOrEqual(30)
    }
  })

  it('updates season via the derived classifier', () => {
    const state = createTestState()
    for (let i = 0; i < 50; i++) {
      tickWeather(state, 5000)
    }
    expect([Season.Spring, Season.Summer, Season.Autumn, Season.Winter]).toContain(state.weather.season)
  })
})

describe('fToC', () => {
  it('converts 32°F to 0°C', () => {
    expect(fToC(32)).toBe(0)
  })

  it('converts 212°F to 100°C', () => {
    expect(fToC(212)).toBe(100)
  })

  it('converts 72°F to 22°C', () => {
    expect(fToC(72)).toBe(22)
  })

  it('converts 35°F to 2°C', () => {
    expect(fToC(35)).toBe(2)
  })
})

describe('mphToKph', () => {
  it('converts 10 mph to 16 kph', () => {
    expect(mphToKph(10)).toBe(16)
  })

  it('converts 25 mph to 40 kph', () => {
    expect(mphToKph(25)).toBe(40)
  })

  it('converts 3 mph to 5 kph', () => {
    expect(mphToKph(3)).toBe(5)
  })
})

describe('tickPrecipitationIntensity', () => {
  let state: GameState

  beforeEach(() => {
    state = createTestState()
    state.precipitationIntensity = 0
  })

  it('ramps up when sky is rain', () => {
    state.weather.sky = Sky.Rain
    tickPrecipitationIntensity(state, 1000)
    expect(state.precipitationIntensity).toBeCloseTo(1000 / RAIN_FADE_DURATION_MS)
  })

  it('ramps down when sky is not rain', () => {
    state.precipitationIntensity = 1
    state.weather.sky = Sky.Sun
    tickPrecipitationIntensity(state, 1000)
    expect(state.precipitationIntensity).toBeCloseTo(1 - 1000 / RAIN_FADE_DURATION_MS)
  })

  it('clamps to 1.0 and does not exceed', () => {
    state.precipitationIntensity = 0.9
    state.weather.sky = Sky.Rain
    tickPrecipitationIntensity(state, RAIN_FADE_DURATION_MS)
    expect(state.precipitationIntensity).toBe(1)
  })

  it('clamps to 0.0 and does not go below', () => {
    state.precipitationIntensity = 0.1
    state.weather.sky = Sky.Sun
    tickPrecipitationIntensity(state, RAIN_FADE_DURATION_MS)
    expect(state.precipitationIntensity).toBe(0)
  })

  it('reaches 1.0 after exactly RAIN_FADE_DURATION_MS of rain', () => {
    state.weather.sky = Sky.Rain
    tickPrecipitationIntensity(state, RAIN_FADE_DURATION_MS)
    expect(state.precipitationIntensity).toBe(1)
  })

  it('stays at 0 when not raining and already 0', () => {
    state.weather.sky = Sky.Sun
    tickPrecipitationIntensity(state, 1000)
    expect(state.precipitationIntensity).toBe(0)
  })

  it('stays at 1 when raining and already 1', () => {
    state.precipitationIntensity = 1
    state.weather.sky = Sky.Rain
    tickPrecipitationIntensity(state, 1000)
    expect(state.precipitationIntensity).toBe(1)
  })

  it('initializes to 0 in createGameState', () => {
    const fresh = createTestState()
    expect(fresh.precipitationIntensity).toBe(0)
  })

  it('targets 1 when sky is snow', () => {
    const fresh = createTestState()
    fresh.precipitationIntensity = 0
    fresh.weather.sky = Sky.Snow
    tickPrecipitationIntensity(fresh, 1000)
    expect(fresh.precipitationIntensity).toBeCloseTo(1000 / RAIN_FADE_DURATION_MS)
  })
})

describe('deriveSeason', () => {
  it('returns Winter below the cold threshold regardless of phase', () => {
    expect(deriveSeason(30, 0)).toBe(Season.Winter)
    expect(deriveSeason(30, 0.25)).toBe(Season.Winter)
    expect(deriveSeason(30, 0.5)).toBe(Season.Winter)
    expect(deriveSeason(30, 0.75)).toBe(Season.Winter)
    expect(deriveSeason(0, 0.5)).toBe(Season.Winter)
    expect(deriveSeason(-5, 0.5)).toBe(Season.Winter)
  })

  it('returns Summer above the hot threshold regardless of phase', () => {
    expect(deriveSeason(80, 0)).toBe(Season.Summer)
    expect(deriveSeason(80, 0.25)).toBe(Season.Summer)
    expect(deriveSeason(80, 0.5)).toBe(Season.Summer)
    expect(deriveSeason(80, 0.75)).toBe(Season.Summer)
    expect(deriveSeason(95, 0)).toBe(Season.Summer)
  })

  it('returns Spring at mid-range temperatures during the spring phase quadrant', () => {
    // [0.00, 0.25) — post-equinox, warming toward summer
    expect(deriveSeason(55, 0)).toBe(Season.Spring)
    expect(deriveSeason(55, 0.1)).toBe(Season.Spring)
    expect(deriveSeason(45, 0.2)).toBe(Season.Spring)
  })

  it('returns Summer at mid-range temperatures during the summer phase quadrant', () => {
    // [0.25, 0.50) — post-solstice, cooling toward autumn
    expect(deriveSeason(55, 0.25)).toBe(Season.Summer)
    expect(deriveSeason(60, 0.35)).toBe(Season.Summer)
    expect(deriveSeason(50, 0.49)).toBe(Season.Summer)
  })

  it('returns Autumn at mid-range temperatures during the autumn phase quadrant', () => {
    // [0.50, 0.75) — post-equinox, cooling toward winter
    expect(deriveSeason(55, 0.5)).toBe(Season.Autumn)
    expect(deriveSeason(55, 0.6)).toBe(Season.Autumn)
    expect(deriveSeason(45, 0.7)).toBe(Season.Autumn)
  })

  it('returns Winter at mid-range temperatures during the winter phase quadrant', () => {
    // [0.75, 1.00) — post-solstice, warming toward spring
    expect(deriveSeason(55, 0.75)).toBe(Season.Winter)
    expect(deriveSeason(55, 0.85)).toBe(Season.Winter)
    expect(deriveSeason(45, 0.95)).toBe(Season.Winter)
  })
})

describe('seasonal phase clock', () => {
  it('advances when in the overworld', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.seasonalPhase = 0
    tickWeather(state, 5000)
    // 5000 / 1_200_000 ≈ 0.00417
    expect(state.seasonalPhase).toBeGreaterThan(0)
    expect(state.seasonalPhase).toBeCloseTo(5000 / SEASONAL_PHASE_PERIOD_MS, 5)
  })

  it('does not advance in the cave zone', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    state.seasonalPhase = 0.3
    tickWeather(state, 5000)
    expect(state.seasonalPhase).toBe(0.3)
  })

  it('does not advance in ruin interiors', () => {
    const state = createTestState()
    state.currentZone = Zone.Ruin
    state.seasonalPhase = 0.6
    tickWeather(state, 5000)
    expect(state.seasonalPhase).toBe(0.6)
  })

  it('wraps modulo 1 across the year boundary', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.seasonalPhase = 0.999
    tickWeather(state, 5000)
    expect(state.seasonalPhase).toBeLessThan(1)
    expect(state.seasonalPhase).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic per game (same dt sequence -> same phase)', () => {
    const a = createTestState()
    const b = createTestState()
    a.currentZone = Zone.Overworld
    b.currentZone = Zone.Overworld
    a.seasonalPhase = 0
    b.seasonalPhase = 0
    for (let i = 0; i < 100; i++) {
      tickWeather(a, 5000)
      tickWeather(b, 5000)
    }
    expect(a.seasonalPhase).toBe(b.seasonalPhase)
  })
})

describe('seasonal sky picking', () => {
  it('Sky.Snow is reachable during humid winter conditions', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.seasonalPhase = 0.75 // winter solstice
    state.weather.season = Season.Winter
    state.weather.temperatureF = 20
    state.weather.humidity = 90
    // Run many ticks; pickSky is probabilistic but with humidity ≥ 75 and
    // season = Winter, snow is the dominant humid-sky outcome (60% of the
    // time over cloudy). Across 200 ticks we should see at least one snow
    // sky.
    let sawSnow = false
    for (let i = 0; i < 200; i++) {
      tickWeather(state, 5000)
      if (state.weather.sky === Sky.Snow) {
        sawSnow = true
        break
      }
      // Re-pin winter conditions so the ticks don't drift out before we sample.
      state.weather.season = Season.Winter
      state.weather.temperatureF = 20
      state.weather.humidity = 90
    }
    expect(sawSnow).toBe(true)
  })
})

describe('seasonal wash', () => {
  it('returns the spring-equinox anchor at phase 0.0 (zero intensity — no wash at game start)', () => {
    const wash = seasonalWash(0)
    expect(wash.intensity).toBe(0)
  })

  it('returns the summer-solstice anchor at phase 0.25', () => {
    const wash = seasonalWash(0.25)
    expect(wash.target).toBe('#f4d58a')
    expect(wash.intensity).toBeCloseTo(0.05, 5)
  })

  it('returns the autumn-equinox anchor at phase 0.5', () => {
    const wash = seasonalWash(0.5)
    expect(wash.target).toBe('#c8865a')
    expect(wash.intensity).toBeCloseTo(0.18, 5)
  })

  it('returns the winter-solstice anchor at phase 0.75', () => {
    const wash = seasonalWash(0.75)
    expect(wash.target).toBe('#b8bcc0')
    expect(wash.intensity).toBeCloseTo(0.4, 5)
  })

  it('phase 0 does not apply the winter target', () => {
    // user-visible contract: game start must not look like winter
    expect(seasonalWash(0).intensity).toBe(0)
    expect(seasonalWash(0).target).not.toBe('#b8bcc0')
  })

  it('shares the gold target between phase 0 and phase 0.25 so the spring leg is intensity-only', () => {
    expect(seasonalWash(0).target).toBe(seasonalWash(0.25).target)
  })

  it('interpolates intensity at the midpoint between spring and summer', () => {
    const wash = seasonalWash(0.125)
    // Midpoint between spring 0.0 and summer 0.05 is 0.025.
    expect(wash.intensity).toBeCloseTo(0.025, 5)
  })

  it('interpolates intensity at the midpoint between winter and spring (wrap-around)', () => {
    const wash = seasonalWash(0.875)
    // Midpoint between winter 0.4 and spring-equinox 0.0 (via wrap) is 0.2.
    expect(wash.intensity).toBeCloseTo(0.2, 5)
  })

  it('normalizes negative phases into [0, 1)', () => {
    const atZero = seasonalWash(0)
    const atNegOne = seasonalWash(-1)
    expect(atNegOne.target).toBe(atZero.target)
    expect(atNegOne.intensity).toBeCloseTo(atZero.intensity, 5)
  })

  it('produces continuous wash across an arbitrary phase step (no pop)', () => {
    const a = seasonalWash(0.249)
    const b = seasonalWash(0.251)
    // Adjacent samples should differ by less than the full anchor distance.
    expect(Math.abs(a.intensity - b.intensity)).toBeLessThan(0.02)
  })

  it('SEASON_WASH_ANCHORS holds exactly four entries at distinct cardinal phases', () => {
    expect(SEASON_WASH_ANCHORS).toHaveLength(4)
    const phases = SEASON_WASH_ANCHORS.map((a) => a.phase)
    expect(phases).toEqual([0.0, 0.25, 0.5, 0.75])
  })

  it('applySeasonalWash blends source toward target by intensity', () => {
    // Black source toward white target at intensity 0.5 → mid-grey #808080.
    expect(applySeasonalWash('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('applySeasonalWash returns source unchanged at intensity 0', () => {
    expect(applySeasonalWash('#445566', '#ffffff', 0)).toBe('#445566')
  })

  it('applySeasonalWash returns target at intensity 1', () => {
    expect(applySeasonalWash('#445566', '#aabbcc', 1)).toBe('#aabbcc')
  })

  it('applySeasonalWash memoizes per (source, target, intensity)', () => {
    // Same inputs return strictly-equal output; the memoization cache is
    // an implementation detail but the contract (deterministic pure
    // output) holds either way.
    const a = applySeasonalWash('#224F30', '#b8bcc0', 0.4)
    const b = applySeasonalWash('#224F30', '#b8bcc0', 0.4)
    expect(a).toBe(b)
  })
})

describe('phaseToDate', () => {
  it('phase 0 returns the spring equinox (March 20)', () => {
    expect(phaseToDate(0)).toEqual({ month: 3, day: 20 })
  })

  it('phase 0.25 returns a date in June (summer solstice region)', () => {
    // A fixed-quarter 365-day calendar puts phase 0.25 around June 18-21
    // depending on integer rounding. Real-world June 21 is day-of-year 172
    // but our 365/4 anchor lands at day 170. "Things may have drifted."
    const { month, day } = phaseToDate(0.25)
    expect(month).toBe(6)
    expect(day).toBeGreaterThanOrEqual(17)
    expect(day).toBeLessThanOrEqual(22)
  })

  it('phase 0.5 returns a date in September (autumn equinox region)', () => {
    const { month, day } = phaseToDate(0.5)
    expect(month).toBe(9)
    expect(day).toBeGreaterThanOrEqual(16)
    expect(day).toBeLessThanOrEqual(23)
  })

  it('phase 0.75 returns a date in December (winter solstice region)', () => {
    const { month, day } = phaseToDate(0.75)
    expect(month).toBe(12)
    expect(day).toBeGreaterThanOrEqual(16)
    expect(day).toBeLessThanOrEqual(22)
  })

  it('wraps phases >= 1 back to the spring equinox', () => {
    expect(phaseToDate(1)).toEqual({ month: 3, day: 20 })
    expect(phaseToDate(2.0)).toEqual({ month: 3, day: 20 })
  })

  it('handles negative phases via modulo wrap', () => {
    expect(phaseToDate(-1)).toEqual({ month: 3, day: 20 })
  })

  it('is pure: same phase returns same date', () => {
    const a = phaseToDate(0.42)
    const b = phaseToDate(0.42)
    expect(a).toEqual(b)
  })

  it('phase 0.999 returns a date close to March 20 (year-end wrap)', () => {
    const { month, day } = phaseToDate(0.999)
    expect(month).toBe(3)
    expect(day).toBeGreaterThanOrEqual(19)
    expect(day).toBeLessThanOrEqual(20)
  })
})

describe('current-date sync with seasonalPhase', () => {
  it('initial state.currentDate matches the spring equinox', () => {
    const state = createTestState()
    // createTestState helper currently pins phase to 0.125 (mid-spring),
    // so prove the wiring by resetting and reading after a tickWeather.
    state.seasonalPhase = 0
    state.currentZone = Zone.Cave // keep phase from advancing
    tickWeather(state, 0)
    expect(state.currentDate).toEqual({ month: 3, day: 20 })
  })

  it('tickWeather updates state.currentDate from state.seasonalPhase', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    state.seasonalPhase = 0.5 // autumn equinox
    tickWeather(state, 0)
    expect(state.currentDate.month).toBe(9)
  })

  it('returning to phase 0 (year wrap) restores the equinox date', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    state.seasonalPhase = 0
    tickWeather(state, 0)
    expect(state.currentDate).toEqual({ month: 3, day: 20 })
  })
})
