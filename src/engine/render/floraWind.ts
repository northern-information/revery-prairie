import { tileHash } from '@/engine/position'
import { CloverStage, WindDirection, Zone } from '@/engine/types'
import type { CloverLifecycleState, Weather, WindDirection as WindDirectionType, Zone as ZoneType } from '@/engine/types'

// ─── constants ───────────────────────────────────────────────────────────────

const MAX_WIND_SPEED = 25

/**
 * Base oscillation frequency (rad/ms) at zero wind.
 * At max wind, WIND_FREQ_FACTOR is added on top.
 */
const BASE_FREQ_MS = 0.0015
const WIND_FREQ_FACTOR = 0.0025

/**
 * Amplitude ceilings as a fraction of charWidth / charHeight.
 * Y > X so the effect reads as a nodding tip rather than a horizontal lean.
 */
const DX_FRACTION = 0.10
const DY_FRACTION = 0.28

/**
 * Max brightness shift (per RGB channel, 0–255) at peak oscillation.
 */
const LUMINANCE_RANGE = 12

/**
 * Max change per ms in the speed-scaled direction vector (smoothSx, smoothSy).
 * The vector range is -MAX_WIND_SPEED to +MAX_WIND_SPEED, so full span = 50 units.
 * At 3 seconds for full span: 50 / 3000 ≈ 0.0167 units/ms.
 * At 60 fps (dt≈16ms) this is ~0.267 units/frame — imperceptibly small per frame,
 * but a full direction reversal at normal wind speed (~15 mph) completes in ~1.9 s.
 *
 * Using constant-rate (linear) clamping rather than exponential smoothing so
 * every frame of a transition moves by the same amount. Exponential ease-out
 * has a fast start that reads as a visible "catch-up" when all tiles shift together.
 */
const WIND_CHANGE_RATE = 50 / 3000

// ─── wind direction → iso screen vectors ─────────────────────────────────────

/**
 * Each entry is {sx, sy} — unit multipliers for maxDx and maxDy respectively.
 *
 * Derived from the iso projection:
 *   px = (vx - vy) * charWidth
 *   py = (vx + vy) * (charHeight / 2)
 *
 * Wind FROM direction C means the wind blows toward the opposite world direction
 * (dwx, dwy). The resulting screen delta per unit step is:
 *   dpx = (dwx - dwy) * charWidth  →  sx = dwx - dwy
 *   dpy = (dwx + dwy) * (charHeight / 2)  →  sy = dwx + dwy
 *
 * All vectors are normalized to magnitude ≤ 1 so amplitude bounds are
 * determined solely by DX_FRACTION / DY_FRACTION × windFraction.
 */
const WIND_SCREEN_VECTORS: Record<WindDirectionType, { sx: number; sy: number }> = {
  [WindDirection.N]:  { sx: -1, sy:  1 }, // blows south
  [WindDirection.S]:  { sx:  1, sy: -1 }, // blows north
  [WindDirection.E]:  { sx: -1, sy: -1 }, // blows west
  [WindDirection.W]:  { sx:  1, sy:  1 }, // blows east
  [WindDirection.NE]: { sx: -1, sy:  0 }, // blows SW: pure horizontal
  [WindDirection.SW]: { sx:  1, sy:  0 }, // blows NE: pure horizontal
  [WindDirection.NW]: { sx:  0, sy:  1 }, // blows SE: pure vertical
  [WindDirection.SE]: { sx:  0, sy: -1 }, // blows NW: pure vertical
}

// ─── sway factor by clover lifecycle stage ───────────────────────────────────

const SWAY_FACTORS: Record<string, number> = {
  [CloverStage.Healthy]:         1.0,
  [CloverStage.Brown]:           0.5,
  [CloverStage.BlinkingRed]:     0.15,
  [CloverStage.Black]:           0.0,
  [CloverStage.Decomposing]:     0.0,
  [CloverStage.BurntRecovering]: 0.0,
}

const getSwayFactor = (lifecycle: CloverLifecycleState | undefined): number => {
  if (!lifecycle) return SWAY_FACTORS[CloverStage.Healthy]
  return SWAY_FACTORS[lifecycle.stage] ?? 0
}

// ─── color helpers ───────────────────────────────────────────────────────────

const parseColor = (color: string): [number, number, number] | null => {
  // hex: #rrggbb
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (hex) {
    return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)]
  }
  // rgb(r,g,b) — spaces stripped
  const rgb = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(color.replace(/\s+/g, ''))
  if (rgb) {
    return [parseInt(rgb[1]), parseInt(rgb[2]), parseInt(rgb[3])]
  }
  return null
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

const shiftLuminance = (color: string, delta: number): string => {
  const rgb = parseColor(color)
  if (!rgb) return color
  const [r, g, b] = rgb
  return `rgb(${String(clamp255(r + delta))},${String(clamp255(g + delta))},${String(clamp255(b + delta))})`
}

// ─── smooth wind state ────────────────────────────────────────────────────────

// Module-level smoothed wind state.
// Updated once per frame by tickFloraWind(). getFloraSwayOffset() reads
// these values so weather transitions animate in over ~2 seconds instead
// of snapping the moment the weather tick fires.
let smoothSx = 0
let smoothSy = 0
let smoothSpeed = 0
let lastTickTime = -1

// Accumulated integral of the speed-dependent frequency term.
//
// The oscillation formula uses `time * freq` where `freq` has a
// speed-dependent component: `(smoothSpeed / MAX_WIND_SPEED) * WIND_FREQ_FACTOR`.
// Computing `time * freq` directly makes any change to `smoothSpeed` cause
// a phase jump proportional to the current `time` — tiny per-frame speed
// changes become huge phase discontinuities after long play sessions, causing
// all tiles to simultaneously lurch forward in their oscillation cycle.
//
// The fix: accumulate the speed-phase each frame as `speedFreq * dt`. This
// grows at a rate proportional to `dt` (bounded), never to `time` (unbounded).
// getFloraSwayOffset adds this to the base (constant-frequency) phase.
let speedPhaseAccum = 0

/**
 * Called once per frame, before the tile loop.
 * Exponentially smooths the wind direction vector and speed toward the
 * current weather values so direction changes don't cause a visible snap.
 */
export const tickFloraWind = (weather: Weather, time: number): void => {
  const { windSpeed, windDirection } = weather
  const { sx: targetSx, sy: targetSy } = WIND_SCREEN_VECTORS[windDirection]

  if (lastTickTime < 0) {
    // First call — initialise to current values so there's no cold-start drift.
    smoothSx = targetSx * windSpeed
    smoothSy = targetSy * windSpeed
    smoothSpeed = windSpeed
    lastTickTime = time
    return
  }

  const dt = time - lastTickTime
  lastTickTime = time

  if (dt <= 0) return

  // Constant-rate linear interpolation — each frame moves by the same absolute
  // amount regardless of distance to target. This avoids the exponential ease-out
  // "fast at first, slow at end" shape that reads as a synchronized catch-up when
  // all tiles shift together on a weather tick.
  const maxDelta = WIND_CHANGE_RATE * dt

  const dSx = targetSx * windSpeed - smoothSx
  smoothSx += Math.sign(dSx) * Math.min(Math.abs(dSx), maxDelta)

  const dSy = targetSy * windSpeed - smoothSy
  smoothSy += Math.sign(dSy) * Math.min(Math.abs(dSy), maxDelta)

  const dSpeed = windSpeed - smoothSpeed
  smoothSpeed += Math.sign(dSpeed) * Math.min(Math.abs(dSpeed), maxDelta)

  // Accumulate the speed-dependent frequency phase using the UPDATED smoothSpeed.
  // This replaces the time × dynamicFreq pattern in getFloraSwayOffset to avoid
  // the time-amplified phase discontinuity (see speedPhaseAccum declaration above).
  speedPhaseAccum += (smoothSpeed / MAX_WIND_SPEED) * WIND_FREQ_FACTOR * dt
}

/**
 * Reset smooth state — call between tests so each test starts from a known baseline.
 */
export const resetFloraWindSmooth = (): void => {
  smoothSx = 0
  smoothSy = 0
  smoothSpeed = 0
  speedPhaseAccum = 0
  lastTickTime = -1
}

// ─── public API ──────────────────────────────────────────────────────────────

export interface FloraSwayOffset {
  dx: number
  dy: number
  color: string
}

const ZERO_OFFSET = (color: string): FloraSwayOffset => ({ dx: 0, dy: 0, color })

/**
 * Compute the wind-sway pixel offset and luminance-shifted color for a flora
 * tile at world position (mx, my).
 *
 * Uses the smoothed wind state set by the most recent tickFloraWind() call
 * so weather transitions animate in gradually rather than snapping.
 *
 * Returns zero offsets and the original color when:
 * - zone is not Overworld
 * - lifecycle stage has sway factor 0 (Black, Decomposing, BurntRecovering)
 * - smoothed wind speed is effectively 0
 *
 * Amplitude scales with both charWidth/charHeight (zoom-correct) and windSpeed.
 * Y-axis amplitude exceeds X-axis so the effect reads as a nodding tip.
 */
export const getFloraSwayOffset = (
  mx: number,
  my: number,
  time: number,
  zone: ZoneType,
  lifecycle: CloverLifecycleState | undefined,
  charWidth: number,
  charHeight: number,
  baseColor: string,
): FloraSwayOffset => {
  if (zone !== Zone.Overworld) return ZERO_OFFSET(baseColor)

  const swayFactor = getSwayFactor(lifecycle)
  if (swayFactor === 0) return ZERO_OFFSET(baseColor)

  if (smoothSpeed < 0.01) return ZERO_OFFSET(baseColor)

  // Per-tile deterministic phase and frequency variance
  const h = tileHash(mx, my)
  const phase = (h % 1000) * ((2 * Math.PI) / 1000)
  const freqVariance = 0.8 + (h % 200) / 1000 // 0.80 – 1.00

  // Base oscillation frequency (constant per tile — safe to multiply by time).
  // The speed-dependent frequency contribution is NOT multiplied by time here;
  // instead we use speedPhaseAccum (accumulated each frame via dt) to avoid the
  // time-amplified phase discontinuity that occurs when smoothSpeed changes.
  const baseFreq = BASE_FREQ_MS * freqVariance
  const speedPhase = speedPhaseAccum * freqVariance

  // Lean-plus-turbulence model: the glyph rests at a sustained lean in the
  // wind direction (LEAN_FRACTION of max), with turbulence oscillating on top.
  // This prevents the glyph from snapping back to the tile centre on each
  // oscillation cycle — a symmetric [-1,+1] wave reads as a periodic "reset".
  // turbulence ∈ [-(PRIMARY+SECONDARY), +(PRIMARY+SECONDARY)] ≈ [-0.47, +0.47]
  // sway ∈ [LEAN - 0.47, LEAN + 0.47] clamped to [0, 1]
  const LEAN_FRACTION = 0.6
  const turbulence =
    Math.sin(time * baseFreq + speedPhase + phase) * 0.35 +
    Math.sin(time * baseFreq * 1.7 + speedPhase * 1.7 + phase * 1.3) * 0.12
  const sway = Math.max(0, Math.min(1, LEAN_FRACTION + turbulence))

  // Smooth direction: recover unit vector from the speed-scaled smooth components.
  // Falls back to zero displacement if speed is negligible.
  const effectiveSpeed = smoothSpeed
  const effectiveSx = smoothSx / effectiveSpeed
  const effectiveSy = smoothSy / effectiveSpeed

  // Amplitude: fraction of tile size × windSpeed fraction × lifecycle factor.
  const windFraction = effectiveSpeed / MAX_WIND_SPEED
  const maxDx = charWidth * DX_FRACTION * windFraction
  const maxDy = charHeight * DY_FRACTION * windFraction

  const dx = effectiveSx * sway * maxDx * swayFactor
  const dy = effectiveSy * sway * maxDy * swayFactor

  // Luminance tracks turbulence (not total sway) so brightness oscillates
  // around the base color rather than staying locked at the lean offset.
  const luminanceDelta = turbulence * LUMINANCE_RANGE * swayFactor
  const color = shiftLuminance(baseColor, luminanceDelta)

  return { dx, dy, color }
}
