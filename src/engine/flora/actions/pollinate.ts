import { MAX_WIND_SPEED, getWindAt } from '@/engine/weather/wind'
import { Zone } from '@/engine/types'

import type { FloraPollinateProfile, GameState, PollenParticle } from '@/engine/types'

// ─── constants ────────────────────────────────────────────────────────────────

export const MAX_POLLEN = 150

/**
 * World-tile drift distance per ms, per unit of normalized wind speed.
 * At max wind and 1400 ms lifetime: 0.015 × 25 × 1400 / 25 = 0.525 tiles of travel.
 */
const POLLEN_DRIFT_SPEED = 0.015

/**
 * Perpendicular wobble: each particle oscillates transversally to the wind direction.
 * WOBBLE_FREQ controls the cycle rate (rad/ms); WOBBLE_AMP is peak displacement in tiles.
 * Applied as the cosine derivative so integration stays smooth over variable dt.
 */
const WOBBLE_FREQ = 0.003   // rad/ms ≈ 0.5 Hz — one lazy bob every ~2 seconds
const WOBBLE_AMP  = 0.006   // tiles — gentle side-to-side float

/**
 * Per-frame random nudge, independent of wind.
 * Keeps particles from feeling mechanically locked to a rail.
 */
const TURBULENCE = 0.000018 // tiles/ms per unit random

// ─── registry ─────────────────────────────────────────────────────────────────

const pollinateRegistry = new Map<string, FloraPollinateProfile>()

// Register a pollinate profile for a tile type.
// Called at module load time via side-effect imports (e.g. flora/type/clover/clover.ts).
export const registerFloraPollinate = (tileType: string, profile: FloraPollinateProfile): void => {
  pollinateRegistry.set(tileType, profile)
}

// Returns the pollinate profile for the given tile type, or undefined if none registered.
export const getFloraPollinate = (tileType: string): FloraPollinateProfile | undefined =>
  pollinateRegistry.get(tileType)

// ─── particle helpers ─────────────────────────────────────────────────────────

const spawnParticle = (
  state: GameState,
  tx: number,
  ty: number,
  profileId: string,
  profile: FloraPollinateProfile,
): void => {
  if (state.pollen.length >= MAX_POLLEN) return
  const particle: PollenParticle = {
    x: tx + (Math.random() - 0.5),
    y: ty + (Math.random() - 0.5),
    age: 0,
    maxAge: profile.minAge + Math.random() * (profile.maxAge - profile.minAge),
    profileId,
    phase: Math.random() * Math.PI * 2,
  }
  state.pollen.push(particle)
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Per-frame tick: age particles, remove expired ones (swap-with-last for O(1)),
 * and drift all survivors using the current smoothed wind from state.wind.
 *
 * Reads getWindAt(state, 0, 0) — global wind. No module-level state.
 * Called every frame, O(MAX_POLLEN).
 */
export const tickPollenDrift = (state: GameState, dt: number): void => {
  const wind = getWindAt(state, 0, 0)
  if (state.pollen.length === 0) return

  // Use smooth wind direction so random-angle gusts don't scatter pollen sideways.
  // Use total speed for the amplitude so gusts visibly accelerate drift.
  const smoothSpeed = wind.speed
  const totalSpeed = wind.totalSpeed
  if (smoothSpeed < 0.01) {
    // Wind effectively zero — age particles but skip drift computation.
    let i = state.pollen.length - 1
    while (i >= 0) {
      const p = state.pollen[i]
      p.age += dt
      if (p.age >= p.maxAge) {
        state.pollen[i] = state.pollen[state.pollen.length - 1]
        state.pollen.pop()
      }
      i--
    }
    return
  }

  // Normalize smooth vector to unit direction, then scale by total speed fraction.
  const sx = wind.sx / smoothSpeed
  const sy = wind.sy / smoothSpeed
  const windFraction = Math.min(totalSpeed / MAX_WIND_SPEED, 1)

  // Divide drift by zoom so pixel speed stays consistent across zoom levels.
  // At 2× zoom charWidth doubles, so without this correction a 1-tile hop
  // covers twice as many pixels — particles appear to move twice as fast.
  const zoomNorm = 1 / Math.max(0.1, state.zoom)
  const driftX = sx * windFraction * POLLEN_DRIFT_SPEED * zoomNorm * dt
  const driftY = sy * windFraction * POLLEN_DRIFT_SPEED * zoomNorm * dt

  // Perpendicular unit vector (rotate 90°): (-sy, sx)
  const px = -sy
  const py =  sx

  let i = state.pollen.length - 1
  while (i >= 0) {
    const p = state.pollen[i]
    p.age += dt
    if (p.age >= p.maxAge) {
      // O(1) removal: overwrite slot with last element then pop.
      state.pollen[i] = state.pollen[state.pollen.length - 1]
      state.pollen.pop()
    } else {
      // Wind drift
      p.x += driftX
      p.y += driftY

      // Perpendicular wobble — sine derivative gives smooth velocity integration.
      const wobble = WOBBLE_AMP * WOBBLE_FREQ * Math.cos(p.age * WOBBLE_FREQ + p.phase) * zoomNorm * dt
      p.x += px * wobble
      p.y += py * wobble

      // Small random turbulence — breaks mechanical linearity.
      p.x += (Math.random() - 0.5) * TURBULENCE * zoomNorm * dt
      p.y += (Math.random() - 0.5) * TURBULENCE * zoomNorm * dt
    }
    i--
  }
}

/**
 * Interval tick: scan visible tiles for each registered pollinate profile and
 * probabilistically emit particles. Runs on a timer (not every frame).
 * Suppressed outside Overworld zone.
 *
 * Each profile may optionally supply emitGate(state, tx, ty) for lifecycle-
 * specific gating (e.g. only healthy clover emits). Missing gate = always emit.
 */
export const tickPollenEmit = (state: GameState, dt: number): void => {
  if (state.currentZone !== Zone.Overworld) return
  if (pollinateRegistry.size === 0) return

  const wind = getWindAt(state, 0, 0)
  const windSpeed = wind.totalSpeed

  const x0 = Math.max(0, state.camera.x)
  const x1 = Math.min(state.mapWidth - 1, state.camera.x + state.viewportWidth)
  const y0 = Math.max(0, state.camera.y)
  const y1 = Math.min(state.mapHeight - 1, state.camera.y + state.viewportHeight)

  for (const [tileType, profile] of pollinateRegistry) {
    if (windSpeed <= profile.windThreshold) continue

    const windFraction = Math.min(
      (windSpeed - profile.windThreshold) / (MAX_WIND_SPEED - profile.windThreshold),
      1,
    )
    // Probability per tile per tick, normalized by zoom².
    // viewportWidth × viewportHeight scales as 1/zoom², so without correction
    // zooming out quadruples the scan area and quadruples particle emissions.
    // Multiplying by zoom² keeps total expected emissions constant across zoom levels.
    const zoom = state.zoom
    const emitProb = profile.emitRate * windFraction * (dt / 1000) * (zoom * zoom)

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (state.pollen.length >= MAX_POLLEN) return
        if (state.map[ty]?.[tx]?.type !== tileType) continue
        if (profile.emitGate && !profile.emitGate(state, tx, ty)) continue
        if (Math.random() < emitProb) {
          spawnParticle(state, tx, ty, tileType, profile)
        }
      }
    }
  }
}

/**
 * Fire a burst of pollen particles at (fromX, fromY) when the player exits a
 * flora tile. Burst size grows with pollenTrailDepth (consecutive matching steps).
 * Resets pollenTrailDepth to 0 after firing.
 */
export const emitPlayerTrailBurst = (
  state: GameState,
  fromX: number,
  fromY: number,
  tileType: string,
): void => {
  const profile = pollinateRegistry.get(tileType)
  if (!profile) return

  const count = 2 + Math.min(state.pollenTrailDepth, 6)
  for (let i = 0; i < count; i++) {
    spawnParticle(state, fromX, fromY, tileType, profile)
  }
  state.pollenTrailDepth = 0
}
