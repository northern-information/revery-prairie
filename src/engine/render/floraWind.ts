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

// ─── wind direction → iso screen vectors ─────────────────────────────────────

/**
 * Each entry is {sx, sy} — multipliers for maxDx and maxDy respectively.
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
 * Diagonal directions produce a 2× component on one axis; sx/sy are left
 * un-normalized so the diagonal cases give correct iso alignment (e.g. NE
 * wind is pure horizontal sway, NW wind is pure vertical sway).
 */
const WIND_SCREEN_VECTORS: Record<WindDirectionType, { sx: number; sy: number }> = {
  [WindDirection.N]:  { sx: -1, sy:  1 }, // blows south: (-vx, +vy) → iso: (-1, +1)
  [WindDirection.S]:  { sx:  1, sy: -1 }, // blows north: (+vx, -vy) → iso: (+1, -1)
  [WindDirection.E]:  { sx: -1, sy: -1 }, // blows west:  (-vx, 0)   → iso: (-1, -1)
  [WindDirection.W]:  { sx:  1, sy:  1 }, // blows east:  (+vx, 0)   → iso: (+1, +1)
  [WindDirection.NE]: { sx: -2, sy:  0 }, // blows SW: (-vx+vy) → pure horizontal
  [WindDirection.SW]: { sx:  2, sy:  0 }, // blows NE: (+vx-vy) → pure horizontal
  [WindDirection.NW]: { sx:  0, sy:  2 }, // blows SE: (+vx+vy) → pure vertical
  [WindDirection.SE]: { sx:  0, sy: -2 }, // blows NW: (-vx-vy) → pure vertical
}

// ─── sway factor by clover lifecycle stage ───────────────────────────────────

const SWAY_FACTORS: Record<string, number> = {
  [CloverStage.Healthy]:        1.0,
  [CloverStage.Brown]:          0.5,
  [CloverStage.BlinkingRed]:    0.15,
  [CloverStage.Black]:          0.0,
  [CloverStage.Decomposing]:    0.0,
  [CloverStage.BurntRecovering]:0.0,
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
 * Returns zero offsets and the original color when:
 * - zone is not Overworld
 * - lifecycle stage has sway factor 0 (Black, Decomposing, BurntRecovering)
 * - windSpeed is 0
 *
 * Amplitude scales with both charWidth/charHeight (zoom-correct) and windSpeed.
 * Y-axis amplitude exceeds X-axis so the effect reads as a nodding tip.
 */
export const getFloraSwayOffset = (
  mx: number,
  my: number,
  time: number,
  weather: Weather,
  zone: ZoneType,
  lifecycle: CloverLifecycleState | undefined,
  charWidth: number,
  charHeight: number,
  baseColor: string,
): FloraSwayOffset => {
  if (zone !== Zone.Overworld) return ZERO_OFFSET(baseColor)

  const swayFactor = getSwayFactor(lifecycle)
  if (swayFactor === 0) return ZERO_OFFSET(baseColor)

  const { windSpeed, windDirection } = weather
  if (windSpeed === 0) return ZERO_OFFSET(baseColor)

  // Per-tile deterministic phase and frequency variance
  const h = tileHash(mx, my)
  const phase = (h % 1000) * ((2 * Math.PI) / 1000)
  const freqVariance = 0.8 + (h % 200) / 1000 // 0.80 – 1.00

  const freq = (BASE_FREQ_MS + (windSpeed / MAX_WIND_SPEED) * WIND_FREQ_FACTOR) * freqVariance

  // Two-frequency oscillation: primary + secondary at 1.7× gives an uneven,
  // natural rhythm. Normalized so the combined value stays within [-1, 1].
  const primary = Math.sin(time * freq + phase)
  const secondary = Math.sin(time * freq * 1.7 + phase * 1.3)
  const sway = (primary + secondary * 0.35) / 1.35

  const { sx, sy } = WIND_SCREEN_VECTORS[windDirection]

  // Amplitude: fraction of tile size × windSpeed fraction × lifecycle factor.
  // Diagonal wind vectors (sx or sy = ±2) are already encoded in sx/sy;
  // dividing by 2 keeps peak displacement within DX/DY_FRACTION bounds.
  const windFraction = windSpeed / MAX_WIND_SPEED
  const maxDx = charWidth * DX_FRACTION * windFraction
  const maxDy = charHeight * DY_FRACTION * windFraction
  const diagonalScale = Math.abs(sx) === 2 || Math.abs(sy) === 2 ? 0.5 : 1

  const dx = sx * sway * maxDx * swayFactor * diagonalScale
  const dy = sy * sway * maxDy * swayFactor * diagonalScale

  const luminanceDelta = sway * LUMINANCE_RANGE * swayFactor
  const color = shiftLuminance(baseColor, luminanceDelta)

  return { dx, dy, color }
}
