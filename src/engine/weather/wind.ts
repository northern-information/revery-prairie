import { WindDirection } from '../types'

import type { GameState, WindDirection as WindDirectionType, WindSample, WindState } from '../types'

// ─── constants ────────────────────────────────────────────────────────────────

export const MAX_WIND_SPEED = 25

// How fast the smoothed wind vector converges toward the weather target.
// Full span (-MAX to +MAX = 50 units) covered in 500ms → 0.1 units/ms.
// Constant-rate (not exponential) so all tiles shift by the same amount
// each frame, avoiding the visible "catch-up" of exponential ease-out.
const WIND_CHANGE_RATE = 50 / 500

// Gust lifecycle durations (ms). Ranges produce natural variation.
const GUST_ATTACK_MIN_MS = 500
const GUST_ATTACK_MAX_MS = 1500
const GUST_HOLD_MIN_MS = 200
const GUST_HOLD_MAX_MS = 800
const GUST_DECAY_MIN_MS = 1000
const GUST_DECAY_MAX_MS = 3000

// Probability of a gust starting per tick (at max wind speed).
// Scaled linearly by windSpeed / MAX_WIND_SPEED so calm days get micro-gusts.
const GUST_BASE_CHANCE = 0.4

// Max dt used for phaseAccum accumulation. Caps the phase advance when the
// browser tab is backgrounded then foregrounded — prevents a sudden large
// phase jump visible as all tiles simultaneously lurching forward.
const MAX_PHASE_DT_MS = 100

// ─── iso screen vectors ───────────────────────────────────────────────────────

// Canonical source of truth. Maps wind FROM direction to iso screen drift
// vector (sx, sy) for animations. Derived from the iso projection:
//   px = (vx - vy) * charWidth  →  sx = dwx - dwy
//   py = (vx + vy) * (charHeight / 2)  →  sy = dwx + dwy
// where (dwx, dwy) is the world direction the wind blows toward.
// Cardinal directions (N/S/E/W) map to diagonal screen vectors — magnitude √2.
// Ordinal directions (NE/SW/NW/SE) map to axis-aligned screen vectors — magnitude 1.
export const WIND_SCREEN_VECTORS: Record<WindDirectionType, { sx: number; sy: number }> = {
  [WindDirection.N]:  { sx: -1, sy:  1 }, // blows south
  [WindDirection.S]:  { sx:  1, sy: -1 }, // blows north
  [WindDirection.E]:  { sx: -1, sy: -1 }, // blows west
  [WindDirection.W]:  { sx:  1, sy:  1 }, // blows east
  [WindDirection.NE]: { sx: -1, sy:  0 }, // blows SW
  [WindDirection.SW]: { sx:  1, sy:  0 }, // blows NE
  [WindDirection.NW]: { sx:  0, sy:  1 }, // blows SE
  [WindDirection.SE]: { sx:  0, sy: -1 }, // blows NW
}

// ─── coarse wind field stub ───────────────────────────────────────────────────

// WindCell and WindState/WindSample types are defined in types.ts.
// When coarseField is enabled: populate state.wind.coarseField with a
// WindCell[][] grid and set coarseResolution to the tile size of each cell.
// getWindAt will then bilinearly interpolate instead of returning global values.

// ─── helpers ──────────────────────────────────────────────────────────────────

const randBetween = (min: number, max: number): number =>
  min + Math.random() * (max - min)

// Convert a continuous world angle (radians, 0 = east) to an iso screen vector.
// Used for gust directions so they aren't limited to the 8 cardinal/ordinal entries.
const worldAngleToScreen = (angle: number): { sx: number; sy: number } => {
  const dwx = Math.cos(angle)
  const dwy = Math.sin(angle)
  const sx = dwx - dwy
  const sy = dwx + dwy
  const mag = Math.sqrt(sx * sx + sy * sy)
  if (mag < 0.0001) return { sx: 1, sy: 0 }
  return { sx: sx / mag, sy: sy / mag }
}

// ─── public API ───────────────────────────────────────────────────────────────

export const initWindState = (): WindState => ({
  smoothSx: 0,
  smoothSy: 0,
  smoothSpeed: 0,
  phaseAccum: 0,
  gustPhase: 'none',
  gustPhaseStart: 0,
  gustPhaseDuration: 0,
  gustIntensity: 0,
  gustPeakIntensity: 0,
  gustSx: 1,
  gustSy: 0,
  coarseField: null,
  coarseResolution: 16,
})

export const tickWind = (state: GameState, time: number, dt: number): void => {
  const wind = state.wind
  const { windSpeed, windDirection } = state.weather
  const { sx: targetSx, sy: targetSy } = WIND_SCREEN_VECTORS[windDirection]

  // Cold-start: snap to current weather so there's no initial drift-in animation.
  if (wind.smoothSpeed === 0 && wind.smoothSx === 0 && wind.smoothSy === 0) {
    wind.smoothSx = targetSx * windSpeed
    wind.smoothSy = targetSy * windSpeed
    wind.smoothSpeed = windSpeed
  }

  // Constant-rate linear interpolation toward weather target.
  const maxDelta = WIND_CHANGE_RATE * dt

  const dSx = targetSx * windSpeed - wind.smoothSx
  wind.smoothSx += Math.sign(dSx) * Math.min(Math.abs(dSx), maxDelta)

  const dSy = targetSy * windSpeed - wind.smoothSy
  wind.smoothSy += Math.sign(dSy) * Math.min(Math.abs(dSy), maxDelta)

  const dSpeed = windSpeed - wind.smoothSpeed
  wind.smoothSpeed += Math.sign(dSpeed) * Math.min(Math.abs(dSpeed), maxDelta)

  // Accumulate normalized wind-time for animation phase continuity.
  const cappedDt = Math.min(dt, MAX_PHASE_DT_MS)
  wind.phaseAccum += (wind.smoothSpeed / MAX_WIND_SPEED) * cappedDt

  // ── Gust lifecycle ──────────────────────────────────────────────────────────

  const elapsed = time - wind.gustPhaseStart

  if (wind.gustPhase === 'none') {
    // Probabilistic trigger — GUST_BASE_CHANCE is per second; scale by dt so
    // frame rate doesn't affect gust frequency. Scales with current wind speed.
    const chance = GUST_BASE_CHANCE * (dt / 1000) * (windSpeed / MAX_WIND_SPEED)
    if (dt > 0 && Math.random() < chance) {
      wind.gustPeakIntensity = (windSpeed / MAX_WIND_SPEED) * (0.3 + Math.random() * 0.7)
      const angle = Math.random() * Math.PI * 2
      const dir = worldAngleToScreen(angle)
      wind.gustSx = dir.sx
      wind.gustSy = dir.sy
      wind.gustPhase = 'attack'
      wind.gustPhaseStart = time
      wind.gustPhaseDuration = randBetween(GUST_ATTACK_MIN_MS, GUST_ATTACK_MAX_MS)
      wind.gustIntensity = 0
    }
  } else if (wind.gustPhase === 'attack') {
    const t = Math.min(elapsed / wind.gustPhaseDuration, 1)
    wind.gustIntensity = t * wind.gustPeakIntensity
    if (t >= 1) {
      wind.gustPhase = 'hold'
      wind.gustPhaseStart = time
      wind.gustPhaseDuration = randBetween(GUST_HOLD_MIN_MS, GUST_HOLD_MAX_MS)
    }
  } else if (wind.gustPhase === 'hold') {
    wind.gustIntensity = wind.gustPeakIntensity
    if (elapsed >= wind.gustPhaseDuration) {
      wind.gustPhase = 'decay'
      wind.gustPhaseStart = time
      wind.gustPhaseDuration = randBetween(GUST_DECAY_MIN_MS, GUST_DECAY_MAX_MS)
    }
  } else if (wind.gustPhase === 'decay') {
    const t = Math.min(elapsed / wind.gustPhaseDuration, 1)
    wind.gustIntensity = (1 - t) * wind.gustPeakIntensity
    if (t >= 1) {
      wind.gustPhase = 'none'
      wind.gustIntensity = 0
    }
  }
}

export const getWindAt = (state: GameState, _x: number, _y: number): WindSample => {
  const wind = state.wind

  // Coarse field path — written but unreachable while coarseField is null.
  // To enable: populate state.wind.coarseField with a WindCell[][] grid and
  // set coarseResolution to the tile size of each cell. getWindAt will then
  // bilinearly interpolate across the grid instead of returning global values.
  if (wind.coarseField !== null) {
    // TODO: bilinear interpolation across coarseField
    // const cellX = Math.floor(_x / wind.coarseResolution)
    // const cellY = Math.floor(_y / wind.coarseResolution)
    // ... interpolate and return per-cell sample
  }

  const { smoothSx, smoothSy, smoothSpeed, gustSx, gustSy, gustIntensity, phaseAccum } = wind

  const gustContribX = gustSx * gustIntensity * MAX_WIND_SPEED
  const gustContribY = gustSy * gustIntensity * MAX_WIND_SPEED
  const gustContribSpeed = gustIntensity * MAX_WIND_SPEED

  return {
    sx: smoothSx,
    sy: smoothSy,
    speed: smoothSpeed,
    gustSx,
    gustSy,
    gustIntensity,
    totalSx: smoothSx + gustContribX,
    totalSy: smoothSy + gustContribY,
    totalSpeed: smoothSpeed + gustContribSpeed,
    phaseAccum,
  }
}
