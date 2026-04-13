import { RAIN_FADE_DURATION_MS } from './constants'
import { Season, Sky, WindDirection } from './types'

import type { GameState, Weather } from './types'

const WIND_DIRECTIONS: WindDirection[] = [
  WindDirection.N,
  WindDirection.NE,
  WindDirection.E,
  WindDirection.SE,
  WindDirection.S,
  WindDirection.SW,
  WindDirection.W,
  WindDirection.NW,
]

// Midwest Illinois spring ranges
const SPRING_TEMP_MIN_F = 35
const SPRING_TEMP_MAX_F = 72
const SPRING_WIND_MIN = 3
const SPRING_WIND_MAX = 25
const SPRING_HUMIDITY_MIN = 45
const SPRING_HUMIDITY_MAX = 85

const randBetween = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min

const pickSky = (humidity: number): Sky => {
  if (humidity >= 75) return Math.random() > 0.4 ? Sky.Rain : Sky.Cloudy
  if (humidity >= 55) return Math.random() > 0.5 ? Sky.Cloudy : Sky.Sun
  return Math.random() > 0.8 ? Sky.Cloudy : Sky.Sun
}

export const generateWeather = (): Weather => {
  const humidity = randBetween(SPRING_HUMIDITY_MIN, SPRING_HUMIDITY_MAX)
  return {
    sky: pickSky(humidity),
    temperatureF: randBetween(SPRING_TEMP_MIN_F, SPRING_TEMP_MAX_F),
    windSpeed: randBetween(SPRING_WIND_MIN, SPRING_WIND_MAX),
    windDirection: WIND_DIRECTIONS[Math.floor(Math.random() * WIND_DIRECTIONS.length)],
    humidity,
    season: Season.Spring,
  }
}

const clamp = (val: number, min: number, max: number): number => Math.max(min, Math.min(max, val))

export const tickWeather = (weather: Weather): void => {
  // Temperature drifts by -2 to +2
  weather.temperatureF = clamp(weather.temperatureF + randBetween(-2, 2), SPRING_TEMP_MIN_F, SPRING_TEMP_MAX_F)

  // Humidity drifts by -3 to +3
  weather.humidity = clamp(weather.humidity + randBetween(-3, 3), SPRING_HUMIDITY_MIN, SPRING_HUMIDITY_MAX)

  // Wind speed drifts by -2 to +2
  weather.windSpeed = clamp(weather.windSpeed + randBetween(-2, 2), SPRING_WIND_MIN, SPRING_WIND_MAX)

  // Wind direction occasionally shifts
  if (Math.random() > 0.85) {
    weather.windDirection = WIND_DIRECTIONS[Math.floor(Math.random() * WIND_DIRECTIONS.length)]
  }

  // Sky adapts to humidity
  if (Math.random() > 0.7) {
    weather.sky = pickSky(weather.humidity)
  }
}

export const tickRainIntensity = (state: GameState, dt: number): void => {
  const target = state.weather.sky === Sky.Rain ? 1 : 0
  const step = dt / RAIN_FADE_DURATION_MS
  if (target > state.rainIntensity) {
    state.rainIntensity = Math.min(state.rainIntensity + step, 1)
  } else if (target < state.rainIntensity) {
    state.rainIntensity = Math.max(state.rainIntensity - step, 0)
  }
}

export const fToC = (f: number): number => Math.round(((f - 32) * 5) / 9)

export const mphToKph = (mph: number): number => Math.round(mph * 1.609)
