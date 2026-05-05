import { WindDirection } from '../types'

import type { GameState, WindDirection as WindDirectionType, WindSample, WindState } from '../types'

// ─── constants ────────────────────────────────────────────────────────────────

export const MAX_WIND_SPEED = 25

// Constant-rate convergence: full span (-MAX to +MAX = 50 units) covered in 500ms.
// Constant rate instead of exponential so all tiles shift by the same amount each frame,
// avoiding the visible "catch-up" tail of exponential ease-out.
const WIND_CHANGE_RATE = 50 / 500

const GUST_ATTACK_MIN_MS = 500
const GUST_ATTACK_MAX_MS = 1500
const GUST_HOLD_MIN_MS = 200
const GUST_HOLD_MAX_MS = 800
const GUST_DECAY_MIN_MS = 1000
const GUST_DECAY_MAX_MS = 3000

// Per-second gust probability at max wind speed (scaled by dt to stay frame-rate-independent).
const GUST_BASE_CHANCE = 0.4

// Caps phase advance on tab restore — prevents all tiles lurching simultaneously on a large dt.
const MAX_PHASE_DT_MS = 100

// ─── iso screen vectors ───────────────────────────────────────────────────────

// Canonical source of truth. Maps wind FROM direction to iso screen drift vector.
// Derived from iso projection: sx = dwx - dwy, sy = dwx + dwy (where dw is blow-to world dir).
// Cardinals map to diagonal screen vectors (magnitude √2); ordinals map to axis-aligned (magnitude 1).
export const WIND_SCREEN_VECTORS: Record<WindDirectionType, { sx: number; sy: number }> = {
  [WindDirection.N]: { sx: -1, sy: 1 }, // blows south
  [WindDirection.S]: { sx: 1, sy: -1 }, // blows north
  [WindDirection.E]: { sx: -1, sy: -1 }, // blows west
  [WindDirection.W]: { sx: 1, sy: 1 }, // blows east
  [WindDirection.NE]: { sx: -1, sy: 0 }, // blows SW
  [WindDirection.SW]: { sx: 1, sy: 0 }, // blows NE
  [WindDirection.NW]: { sx: 0, sy: 1 }, // blows SE
  [WindDirection.SE]: { sx: 0, sy: -1 }, // blows NW
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const randBetween = (min: number, max: number): number => min + Math.random() * (max - min)

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
  initialized: false,
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
})

export const tickWind = (state: GameState, time: number, dt: number): void => {
  const wind = state.wind
  const { windSpeed, windDirection } = state.weather
  const { sx: targetSx, sy: targetSy } = WIND_SCREEN_VECTORS[windDirection]

  if (!wind.initialized) {
    wind.smoothSx = targetSx * windSpeed
    wind.smoothSy = targetSy * windSpeed
    wind.smoothSpeed = windSpeed
    wind.initialized = true
  }

  const maxDelta = WIND_CHANGE_RATE * dt

  const dSx = targetSx * windSpeed - wind.smoothSx
  wind.smoothSx += Math.sign(dSx) * Math.min(Math.abs(dSx), maxDelta)

  const dSy = targetSy * windSpeed - wind.smoothSy
  wind.smoothSy += Math.sign(dSy) * Math.min(Math.abs(dSy), maxDelta)

  const dSpeed = windSpeed - wind.smoothSpeed
  wind.smoothSpeed += Math.sign(dSpeed) * Math.min(Math.abs(dSpeed), maxDelta)

  const cappedDt = Math.min(dt, MAX_PHASE_DT_MS)
  wind.phaseAccum += (wind.smoothSpeed / MAX_WIND_SPEED) * cappedDt

  // ── Gust lifecycle ──────────────────────────────────────────────────────────

  const elapsed = time - wind.gustPhaseStart

  if (wind.gustPhase === 'none') {
    // Scale by dt/1000 so gust frequency is per-second, not per-frame.
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
