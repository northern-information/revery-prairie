import { tileHash } from '@/engine/position'
import { Zone } from '@/engine/types'
import { getWindAt, MAX_WIND_SPEED } from '@/engine/weather/wind'
import type { GameState, Zone as ZoneType } from '@/engine/types'

// ─── types ────────────────────────────────────────────────────────────────────

export interface FloraMovementProfile {
  baseFreqMs: number
  windFreqFactor: number
  // waveKA is the primary wave; waveKB creates a beat envelope for organic gusts.
  waveKA: number
  waveKB: number
  leanFraction: number
  dxFraction: number
  dyFraction: number
  // Sway multiplier per lifecycle stage. Missing stages default to 1.0 (full sway).
  swayFactors: Record<string, number>
}

export interface FloraSwayOffset {
  dx: number
  dy: number
  color: string
}

// ─── registry ─────────────────────────────────────────────────────────────────

const movementRegistry = new Map<string, FloraMovementProfile>()

export const registerFloraMovement = (tileType: string, profile: FloraMovementProfile): void => {
  movementRegistry.set(tileType, profile)
}

export const getFloraMovement = (tileType: string): FloraMovementProfile | undefined => movementRegistry.get(tileType)

export const unregisterFloraMovement = (tileType: string): void => {
  movementRegistry.delete(tileType)
}

// ─── sway computation ─────────────────────────────────────────────────────────

const zeroOffset = (color: string): FloraSwayOffset => ({ dx: 0, dy: 0, color })

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
  baseColor: string
): FloraSwayOffset => {
  if (zone !== Zone.Overworld) return zeroOffset(baseColor)

  const swayFactor = lifecycleStage !== undefined ? (profile.swayFactors[lifecycleStage] ?? 1.0) : 1.0
  if (swayFactor === 0) return zeroOffset(baseColor)

  const wind = getWindAt(state, mx, my)
  if (wind.speed < 0.01) return zeroOffset(baseColor)

  const effectiveSx = wind.sx / wind.speed
  const effectiveSy = wind.sy / wind.speed

  const h = tileHash(mx, my)
  const freqVariance = 0.99 + (h % 10) / 1000
  const tilePhase = ((h % 1000) / 1000) * Math.PI * 2 * 0.02

  const baseFreq = profile.baseFreqMs * freqVariance
  const speedPhase = wind.phaseAccum * profile.windFreqFactor * freqVariance

  // Fixed diagonal axis so phase doesn't jump when wind direction changes.
  const windProj = mx + my

  const turbulence =
    Math.sin(time * baseFreq + speedPhase + tilePhase - windProj * profile.waveKA) * 0.35 +
    Math.sin(time * baseFreq * 1.3 + speedPhase * 1.3 + tilePhase - windProj * profile.waveKB) * 0.12
  const sway = Math.max(0, Math.min(1, profile.leanFraction + turbulence))

  const windFraction = wind.speed / MAX_WIND_SPEED
  const maxDx = charWidth * profile.dxFraction * windFraction
  const maxDy = charHeight * profile.dyFraction * windFraction

  const dx = effectiveSx * sway * maxDx * swayFactor
  const dy = effectiveSy * sway * maxDy * swayFactor

  return { dx, dy, color: baseColor }
}
