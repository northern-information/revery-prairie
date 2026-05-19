import { RAIN_FADE_DURATION_MS, SEASONAL_PHASE_PERIOD_MS } from '../constants'
import { Season, Sky, WindDirection, Zone } from '../types'

import type { GameState, Weather } from '../types'

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

// Operational temperature range covers the full four-season year (precis #2).
// The deep-winter floor of -5°F lets snow events be unambiguous; the summer
// ceiling of 95°F keeps midwest highs in range. The seasonal mean (below) is
// what shapes the *typical* temperature for a given seasonalPhase — the
// hard clamp is just a sanity bound.
const TEMP_MIN_F = -5
const TEMP_MAX_F = 95

const WIND_MIN = 1
const WIND_MAX = 30
const HUMIDITY_MIN = 30
const HUMIDITY_MAX = 95

// Seasonal mean targets used as a soft attractor each tick. Numbers chosen to
// place 0.0/1.0 at deep-winter (20°F), 0.5 at summer peak (75°F), with spring
// and autumn passing through 55°F on the way up/down.
const SEASONAL_TEMP_WINTER = 20
const SEASONAL_TEMP_SUMMER = 75

// Same shape for humidity and wind: winter is dry and calm, summer humid and
// breezy. Effects are intentionally minor — they bias drift, not override it.
const SEASONAL_HUMIDITY_WINTER = 45
const SEASONAL_HUMIDITY_SUMMER = 75
const SEASONAL_WIND_WINTER = 6
const SEASONAL_WIND_SUMMER = 14

// Strength of the bias term per tick. 0.05 means the value moves roughly 5%
// of the way toward the seasonal mean each tick on top of the random drift.
const SEASONAL_BIAS_STRENGTH = 0.05

// Season-classification thresholds. <38°F always reads as winter and >78°F as
// summer no matter the phase; in between, the phase resolves whether we're on
// the way up (spring) or down (autumn).
const WINTER_TEMP_THRESHOLD = 38
const SUMMER_TEMP_THRESHOLD = 78

// Snow gating: winter humid skies precipitate as snow rather than rain.
const SNOW_HUMIDITY_THRESHOLD = 75

const randBetween = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min

// Seasonal phase wraps every SEASONAL_PHASE_PERIOD_MS. The phase peaks at 0.5
// (summer) and bottoms at 0 and 1 (deep winter). We use a cosine on the phase
// to derive the seasonal mean for any continuous variable.
const seasonalLerp = (phase: number, winterValue: number, summerValue: number): number => {
  // cos(2π·phase) is +1 at phase 0 (winter), -1 at phase 0.5 (summer). Map
  // that to [winter, summer] by treating +1 as winter and -1 as summer.
  const cos = Math.cos(2 * Math.PI * phase)
  const winterWeight = (cos + 1) / 2 // 1 at phase 0, 0 at phase 0.5
  return winterValue * winterWeight + summerValue * (1 - winterWeight)
}

export const seasonalMeanTemperature = (phase: number): number =>
  seasonalLerp(phase, SEASONAL_TEMP_WINTER, SEASONAL_TEMP_SUMMER)

const seasonalMeanHumidity = (phase: number): number =>
  seasonalLerp(phase, SEASONAL_HUMIDITY_WINTER, SEASONAL_HUMIDITY_SUMMER)

const seasonalMeanWind = (phase: number): number => seasonalLerp(phase, SEASONAL_WIND_WINTER, SEASONAL_WIND_SUMMER)

// Pure classifier. Below WINTER_TEMP_THRESHOLD is unambiguously winter; above
// SUMMER_TEMP_THRESHOLD is unambiguously summer. In the mid-range, the phase
// disambiguates: phases in [0, 0.5) are warming (spring), phases in [0.5, 1)
// are cooling (autumn).
export const deriveSeason = (temperatureF: number, seasonalPhase: number): Season => {
  if (temperatureF < WINTER_TEMP_THRESHOLD) return Season.Winter
  if (temperatureF > SUMMER_TEMP_THRESHOLD) return Season.Summer
  const normalized = ((seasonalPhase % 1) + 1) % 1
  return normalized < 0.5 ? Season.Spring : Season.Autumn
}

const pickSky = (humidity: number, season: Season): Sky => {
  if (humidity >= SNOW_HUMIDITY_THRESHOLD) {
    if (season === Season.Winter) return Math.random() > 0.4 ? Sky.Snow : Sky.Cloudy
    return Math.random() > 0.4 ? Sky.Rain : Sky.Cloudy
  }
  if (humidity >= 55) return Math.random() > 0.5 ? Sky.Cloudy : Sky.Sun
  return Math.random() > 0.8 ? Sky.Cloudy : Sky.Sun
}

export const generateWeather = (): Weather => {
  // Initial weather is generated at game start, when seasonalPhase = 0 (deep
  // winter). We still seed values within the operational range and let
  // deriveSeason classify them so the first tick is internally consistent.
  const humidity = randBetween(HUMIDITY_MIN, HUMIDITY_MAX)
  const temperatureF = Math.round(seasonalMeanTemperature(0) + randBetween(-5, 5))
  const season = deriveSeason(temperatureF, 0)
  return {
    sky: pickSky(humidity, season),
    temperatureF,
    windSpeed: randBetween(WIND_MIN, WIND_MAX),
    windDirection: WIND_DIRECTIONS[Math.floor(Math.random() * WIND_DIRECTIONS.length)],
    humidity,
    season,
  }
}

const clamp = (val: number, min: number, max: number): number => Math.max(min, Math.min(max, val))

// tickWeather (precis #2 signature change): takes the full state because it
// now (a) advances state.seasonalPhase in the overworld zone, (b) biases drift
// toward the seasonal mean, and (c) updates state.weather.season via the
// derived classifier so the rest of the engine can branch on it. dt is the
// wall-clock delta since the last call — at the WEATHER_TICK_MS cadence this
// is ~5000ms per call.
export const tickWeather = (state: GameState, dt: number): void => {
  const weather = state.weather

  // Advance the year only when the steward is in the overworld. Cave / ruin
  // zones freeze the prairie's calendar.
  if (state.currentZone === Zone.Overworld) {
    const advance = dt / SEASONAL_PHASE_PERIOD_MS
    state.seasonalPhase = (state.seasonalPhase + advance) % 1
  }

  const phase = state.seasonalPhase
  const tempMean = seasonalMeanTemperature(phase)
  const humidityMean = seasonalMeanHumidity(phase)
  const windMean = seasonalMeanWind(phase)

  // Random walk plus soft pull toward the seasonal mean. The bias term is
  // small enough that minute-to-minute weather still feels chaotic; over the
  // 20-minute year it dominates so winter actually arrives.
  weather.temperatureF = clamp(
    Math.round(weather.temperatureF + randBetween(-2, 2) + SEASONAL_BIAS_STRENGTH * (tempMean - weather.temperatureF)),
    TEMP_MIN_F,
    TEMP_MAX_F
  )

  weather.humidity = clamp(
    Math.round(weather.humidity + randBetween(-3, 3) + SEASONAL_BIAS_STRENGTH * (humidityMean - weather.humidity)),
    HUMIDITY_MIN,
    HUMIDITY_MAX
  )

  weather.windSpeed = clamp(
    Math.round(weather.windSpeed + randBetween(-2, 2) + SEASONAL_BIAS_STRENGTH * (windMean - weather.windSpeed)),
    WIND_MIN,
    WIND_MAX
  )

  // Wind direction occasionally shifts
  if (Math.random() > 0.85) {
    weather.windDirection = WIND_DIRECTIONS[Math.floor(Math.random() * WIND_DIRECTIONS.length)]
  }

  // Reclassify the season from the (possibly just-updated) temperature and
  // current phase before picking the sky — pickSky needs the right season to
  // decide rain vs snow.
  weather.season = deriveSeason(weather.temperatureF, phase)

  // Sky adapts to humidity
  if (Math.random() > 0.7) {
    weather.sky = pickSky(weather.humidity, weather.season)
  }
}

export const tickPrecipitationIntensity = (state: GameState, dt: number): void => {
  // Both Rain and Snow drive precipitationIntensity to 1; Sun and Cloudy
  // drain it back to 0. This is what lets tile-water hydration, the renderer
  // overlay, and the lifecycle code all share a single normalized signal.
  const sky = state.weather.sky
  const target = sky === Sky.Rain || sky === Sky.Snow ? 1 : 0
  const step = dt / RAIN_FADE_DURATION_MS
  if (target > state.precipitationIntensity) {
    state.precipitationIntensity = Math.min(state.precipitationIntensity + step, 1)
  } else if (target < state.precipitationIntensity) {
    state.precipitationIntensity = Math.max(state.precipitationIntensity - step, 0)
  }
}

export const fToC = (f: number): number => Math.round(((f - 32) * 5) / 9)

export const mphToKph = (mph: number): number => Math.round(mph * 1.609)
