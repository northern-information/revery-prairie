import { RAIN_FADE_DURATION_MS } from '../constants'
import { Season, Sky } from '../types'
import { fToC, generateWeather, mphToKph, tickPrecipitationIntensity, tickWeather } from '../weather'
import { createTestState } from './helpers'

import type { GameState } from '../types'

describe('generateWeather', () => {
  it('returns weather with spring season', () => {
    const weather = generateWeather()
    expect(weather.season).toBe(Season.Spring)
  })

  it('returns temperature within spring range', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(weather.temperatureF).toBeGreaterThanOrEqual(35)
      expect(weather.temperatureF).toBeLessThanOrEqual(72)
    }
  })

  it('returns wind speed within spring range', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(weather.windSpeed).toBeGreaterThanOrEqual(3)
      expect(weather.windSpeed).toBeLessThanOrEqual(25)
    }
  })

  it('returns humidity within spring range', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect(weather.humidity).toBeGreaterThanOrEqual(45)
      expect(weather.humidity).toBeLessThanOrEqual(85)
    }
  })

  it('returns a valid sky condition', () => {
    for (let i = 0; i < 50; i++) {
      const weather = generateWeather()
      expect([Sky.Sun, Sky.Cloudy, Sky.Rain]).toContain(weather.sky)
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
  it('keeps temperature within spring range after many ticks', () => {
    const weather = generateWeather()
    for (let i = 0; i < 200; i++) {
      tickWeather(weather)
      expect(weather.temperatureF).toBeGreaterThanOrEqual(35)
      expect(weather.temperatureF).toBeLessThanOrEqual(72)
    }
  })

  it('keeps humidity within spring range after many ticks', () => {
    const weather = generateWeather()
    for (let i = 0; i < 200; i++) {
      tickWeather(weather)
      expect(weather.humidity).toBeGreaterThanOrEqual(45)
      expect(weather.humidity).toBeLessThanOrEqual(85)
    }
  })

  it('keeps wind speed within spring range after many ticks', () => {
    const weather = generateWeather()
    for (let i = 0; i < 200; i++) {
      tickWeather(weather)
      expect(weather.windSpeed).toBeGreaterThanOrEqual(3)
      expect(weather.windSpeed).toBeLessThanOrEqual(25)
    }
  })

  it('does not change season', () => {
    const weather = generateWeather()
    for (let i = 0; i < 50; i++) {
      tickWeather(weather)
    }
    expect(weather.season).toBe(Season.Spring)
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
})
