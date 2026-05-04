import { tileHash } from '@/engine/position'
import { Zone } from '@/engine/types'
import { MAX_WIND_SPEED, getWindAt } from '@/engine/weather/wind'

import type { GameState, Zone as ZoneType } from '@/engine/types'

// ─── luminance shift toggle ───────────────────────────────────────────────────

// Flip to true to test luminance shifting during development.
// When false, baseColor is returned directly — zero allocation on the hot path.
const LUMINANCE_SHIFT_ENABLED = false

// ─── types ────────────────────────────────────────────────────────────────────

// Profile defining how a flora tile type responds to wind.
// Register one per tile type via registerFloraMovement().
export interface FloraMovementProfile {
  // Oscillation frequency at zero wind (rad/ms).
  baseFreqMs: number
  // Added to base frequency, scaled by wind fraction. Controls how much
  // faster the wave cycles at high wind.
  windFreqFactor: number
  // Spatial wave numbers (rad/tile) for the two interference components.
  // waveKA is the primary wave; waveKB creates a beat envelope with waveKA
  // so gusts feel organic rather than mechanically periodic.
  waveKA: number
  waveKB: number
  // Sustained lean amount (0–1). Turbulence oscillates on top of this.
  leanFraction: number
  // Amplitude ceilings as a fraction of charWidth / charHeight.
  // dxFraction < dyFraction so the effect reads as a nodding tip, not a lateral shove.
  dxFraction: number
  dyFraction: number
  // Max brightness shift per RGB channel (0–255) at peak oscillation.
  // Only applied when LUMINANCE_SHIFT_ENABLED is true.
  luminanceRange: number
  // Pre-parsed base RGB — eliminates regex on the hot path when luminance
  // shift is enabled. Must match the tile's render color.
  parsedBaseColor: [number, number, number]
  // Sway multiplier keyed by lifecycle stage string. Missing stages default
  // to 1.0 (full sway). Set a stage to 0 to disable sway entirely for it.
  swayFactors: Record<string, number>
}

export interface FloraSwayOffset {
  dx: number
  dy: number
  color: string
}

// ─── registry ─────────────────────────────────────────────────────────────────

const movementRegistry = new Map<string, FloraMovementProfile>()

// Register a wind movement profile for a tile type.
// Called at module load time via side-effect imports (e.g. flora/type/clover/clover.ts).
export const registerFloraMovement = (tileType: string, profile: FloraMovementProfile): void => {
  movementRegistry.set(tileType, profile)
}

// Returns the movement profile for the given tile type, or undefined if none registered.
export const getFloraMovement = (tileType: string): FloraMovementProfile | undefined =>
  movementRegistry.get(tileType)

// ─── luminance helpers ────────────────────────────────────────────────────────

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

// Fast luminance shift using a pre-parsed RGB tuple — no regex, no string parsing.
// Allocates one template-literal string per call; only reached when LUMINANCE_SHIFT_ENABLED.
const shiftLuminanceFast = (rgb: [number, number, number], delta: number): string => {
  const d = Math.round(delta)
  return `rgb(${String(clamp255(rgb[0] + d))},${String(clamp255(rgb[1] + d))},${String(clamp255(rgb[2] + d))})`
}

// ─── sway computation ─────────────────────────────────────────────────────────

const zeroOffset = (color: string): FloraSwayOffset => ({ dx: 0, dy: 0, color })

// Compute the wind-sway pixel offset and (optionally) luminance-shifted color
// for a flora tile at world position (mx, my).
//
// Reads the smoothed wind state from state.wind via getWindAt() so weather
// transitions animate in gradually. No module-level state.
//
// Returns zero offsets when:
// - zone is not Overworld
// - lifecycleStage maps to swayFactor 0 (dead/burnt stages)
// - smoothed wind speed is effectively zero
export const getFloraSwayOffset = (
  profile: FloraMovementProfile,
  state: GameState,
  mx: number,
  my: number,
  time: number,
  zone: ZoneType,
  lifecycleStage: string | undefined,
  charWidth: number,
  charHeight: number,
  baseColor: string,
): FloraSwayOffset => {
  if (zone !== Zone.Overworld) return zeroOffset(baseColor)

  const swayFactor =
    lifecycleStage !== undefined ? (profile.swayFactors[lifecycleStage] ?? 1.0) : 1.0
  if (swayFactor === 0) return zeroOffset(baseColor)

  const wind = getWindAt(state, mx, my)
  if (wind.speed < 0.01) return zeroOffset(baseColor)

  // Recover unit direction vector from speed-scaled smooth components.
  const effectiveSx = wind.sx / wind.speed
  const effectiveSy = wind.sy / wind.speed

  // Per-tile variation:
  //   freqVariance — 1% spread so spatial wave stays coherent for ~5 min
  //   tilePhase    — tiny static offset so tiles on the same wavefront
  //                  aren't in perfect lockstep at t=0
  const h = tileHash(mx, my)
  const freqVariance = 0.99 + (h % 10) / 1000
  const tilePhase = ((h % 1000) / 1000) * Math.PI * 2 * 0.02

  // Base frequency safe to multiply by time (constant per tile).
  // Speed-dependent phase comes from state.wind.phaseAccum to avoid
  // time-amplified discontinuities when wind speed changes.
  const baseFreq = profile.baseFreqMs * freqVariance
  const speedPhase = wind.phaseAccum * profile.windFreqFactor * freqVariance

  // Spatial phase for tile staggering — tiles along the iso SW-NE diagonal lead/lag.
  // Fixed axis (not wind-direction-projected) so phase doesn't jump when wind turns;
  // a projection onto a rotating effectiveSx/eSy would shift all tiles simultaneously
  // as direction transitions, producing a visible hard reset.
  const windProj = mx + my

  // Lean-plus-turbulence: two spatial frequencies create a beat envelope
  // (~42-tile period) that reads as natural gusts rolling through.
  const turbulence =
    Math.sin(time * baseFreq + speedPhase + tilePhase - windProj * profile.waveKA) * 0.35 +
    Math.sin(time * baseFreq * 1.3 + speedPhase * 1.3 + tilePhase - windProj * profile.waveKB) * 0.12
  const sway = Math.max(0, Math.min(1, profile.leanFraction + turbulence))

  // Amplitude scales with wind speed and tile size for zoom-correctness.
  const windFraction = wind.speed / MAX_WIND_SPEED
  const maxDx = charWidth * profile.dxFraction * windFraction
  const maxDy = charHeight * profile.dyFraction * windFraction

  const dx = effectiveSx * sway * maxDx * swayFactor
  const dy = effectiveSy * sway * maxDy * swayFactor

  const color =
    LUMINANCE_SHIFT_ENABLED
      ? shiftLuminanceFast(profile.parsedBaseColor, turbulence * profile.luminanceRange * swayFactor)
      : baseColor

  return { dx, dy, color }
}
