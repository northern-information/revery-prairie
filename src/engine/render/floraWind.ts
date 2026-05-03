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
 * Spatial wave numbers (radians per tile) for the two turbulence components.
 *
 * WAVE_K_A is the primary wave — tiles further downwind lag by WAVE_K_A per tile.
 * Wavelength = 2π / 0.30 ≈ 21 tiles; at a 30-tile viewport you see ~1.5 crests.
 * Longer wavelength than before (was 0.50 / 12.6 tiles) for a more gradual prairie
 * roll rather than choppy ocean-like chop.
 *
 * WAVE_K_B is a slightly different spatial frequency for the secondary component.
 * Its interference with WAVE_K_A creates a beat envelope with period
 * 2π / (WAVE_K_A − WAVE_K_B) = 2π / 0.15 ≈ 42 tiles — a slowly-drifting patch
 * of stronger / weaker sway that reads as natural gusts without per-tile randomness.
 */
const WAVE_K_A = 0.30
const WAVE_K_B = 0.15

/**
 * Max change per ms in the speed-scaled direction vector (smoothSx, smoothSy).
 * The vector range is -MAX_WIND_SPEED to +MAX_WIND_SPEED, so full span = 50 units.
 * At 0.5 seconds for full span: 50 / 500 ≈ 0.1 units/ms.
 * At 60 fps (dt≈16ms) this is ~1.6 units/frame — a full direction reversal at normal
 * wind speed (~15 mph) completes in ~0.3 s (~1-2 frames near zero instead of several).
 *
 * Faster rate eliminates the multi-frame near-zero band during 180° direction changes
 * (W→E), which was manifesting as a brief full-field "reset" to the unswayed position.
 *
 * Using constant-rate (linear) clamping rather than exponential smoothing so
 * every frame of a transition moves by the same amount. Exponential ease-out
 * has a fast start that reads as a visible "catch-up" when all tiles shift together.
 */
const WIND_CHANGE_RATE = 50 / 500

/**
 * Max dt (ms) used for speedPhaseAccum accumulation.
 * Caps the phase advance when the browser tab is backgrounded then foregrounded —
 * rAF fires with the full elapsed background time, which would jump speedPhaseAccum
 * by a large amount and cause all tiles to simultaneously lurch forward in their cycle.
 */
const MAX_PHASE_DT_MS = 100

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
  // Cap dt here so a backgrounded tab foregrounded after many seconds doesn't cause
  // a sudden large phase jump visible as all tiles simultaneously lurching forward.
  const cappedDt = Math.min(dt, MAX_PHASE_DT_MS)
  speedPhaseAccum += (smoothSpeed / MAX_WIND_SPEED) * WIND_FREQ_FACTOR * cappedDt
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

  // Smooth direction: recover unit vector from the speed-scaled smooth components.
  const effectiveSpeed = smoothSpeed
  const effectiveSx = smoothSx / effectiveSpeed
  const effectiveSy = smoothSy / effectiveSpeed

  // Per-tile variation sources:
  //   freqVariance — causes tiles to drift apart slowly over time (organic desync).
  //                  Kept tight (1% spread) so the spatial wave pattern stays coherent
  //                  for ~5 minutes before tiles noticeably go their own way.
  //                  Old 8% spread caused full desync in ~10 seconds, burying the wave.
  //   tilePhase    — tiny static per-tile phase offset (2% of a full cycle) so tiles
  //                  along the same wavefront aren't perfectly in lockstep at t=0.
  const h = tileHash(mx, my)
  const freqVariance = 0.99 + (h % 10) / 1000       // 0.990 – 1.000
  const tilePhase = ((h % 1000) / 1000) * Math.PI * 2 * 0.02  // 0 – 0.126 rad

  // Base oscillation frequency (constant per tile — safe to multiply by time).
  // Speed-dependent phase is accumulated externally to avoid time-amplified jumps.
  const baseFreq = BASE_FREQ_MS * freqVariance
  const speedPhase = speedPhaseAccum * freqVariance

  // Spatial wave: project tile position onto the wind direction.
  // The negative sign makes the wave travel downwind (upwind tiles lead).
  const windProj = mx * effectiveSx + my * effectiveSy

  // Lean-plus-turbulence model: glyph rests at a sustained lean (LEAN_FRACTION)
  // with turbulence oscillating on top.
  //
  // Two components at different spatial frequencies (WAVE_K_A, WAVE_K_B) create
  // a natural beat envelope — patches of stronger / weaker sway every ~42 tiles
  // that read as gusts rolling through.  tilePhase adds subtle within-wavefront
  // variation; freqVariance causes gradual desync over time.
  //
  // Secondary temporal multiplier is 1.3× (was 1.7×) — closer frequencies produce
  // a slower, more languid interference pattern rather than rapid noisy flickering.
  //
  // turbulence ∈ [-0.47, +0.47],  sway ∈ [0.13, 1.0] (clamped)
  const LEAN_FRACTION = 0.6
  const turbulence =
    Math.sin(time * baseFreq + speedPhase + tilePhase - windProj * WAVE_K_A) * 0.35 +
    Math.sin(time * baseFreq * 1.3 + speedPhase * 1.3 + tilePhase - windProj * WAVE_K_B) * 0.12
  const sway = Math.max(0, Math.min(1, LEAN_FRACTION + turbulence))

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
