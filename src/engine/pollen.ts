import { posKey } from '@/engine/position'
import { CloverStage, TileType, WindDirection, Zone } from '@/engine/types'
import type { GameState, PollenParticle, PollenProfile, WindDirection as WindDirectionType } from '@/engine/types'

// ─── constants ───────────────────────────────────────────────────────────────

export const MAX_POLLEN = 150
export const MAX_BEE_POLLEN = 4
export const BEE_POLLEN_DECAY_MS = 4000

/**
 * World-tile drift distance per ms at full wind speed.
 * At 25 mph max wind and 1400 ms max lifetime: 0.015 × 25 × 1400 = 0.525 tiles of travel
 * (scaled by windFraction so actual travel ≈ 0.5 tiles at max wind — subtle drift).
 */
const POLLEN_DRIFT_SPEED = 0.015

const MAX_WIND_SPEED = 25

// ─── flora registry ───────────────────────────────────────────────────────────

/**
 * Registry mapping profileId → pollen behavior for a flora type.
 * Adding future flora (tall grass, wildflowers, etc.) requires only a new entry here —
 * no changes to emission, drift, or render logic.
 */
export const POLLEN_PROFILES: Record<string, PollenProfile> = {
  clover: {
    glyph: '.',
    color: '#b07fc7',     // Dalea purpurea purple
    windThreshold: 8,      // mph — no emission below this
    emitRate: 0.15,        // particles per eligible tile per second at max wind above threshold
    minAge: 800,           // ms
    maxAge: 1400,          // ms
  },
}

// ─── wind direction → iso screen vectors ─────────────────────────────────────

/**
 * Maps wind FROM direction to screen drift vector (sx, sy).
 * Matches the WIND_SCREEN_VECTORS in floraWind.ts — keep in sync when that
 * module is available (flora-wind-sway branch). Pollen uses unsmoothed weather
 * values for now; when flora-wind-sway is merged, update tickPollenDrift to read
 * the exported smooth state instead.
 */
const WIND_SCREEN_VECTORS: Record<WindDirectionType, { sx: number; sy: number }> = {
  [WindDirection.N]:  { sx: -1, sy:  1 },
  [WindDirection.S]:  { sx:  1, sy: -1 },
  [WindDirection.E]:  { sx: -1, sy: -1 },
  [WindDirection.W]:  { sx:  1, sy:  1 },
  [WindDirection.NE]: { sx: -1, sy:  0 },
  [WindDirection.SW]: { sx:  1, sy:  0 },
  [WindDirection.NW]: { sx:  0, sy:  1 },
  [WindDirection.SE]: { sx:  0, sy: -1 },
}

// ─── particle helpers ─────────────────────────────────────────────────────────

const spawnParticle = (
  state: GameState,
  tx: number,
  ty: number,
  profileId: string,
  profile: PollenProfile,
): void => {
  if (state.pollen.length >= MAX_POLLEN) return
  const particle: PollenParticle = {
    x: tx + (Math.random() - 0.5),
    y: ty + (Math.random() - 0.5),
    age: 0,
    maxAge: profile.minAge + Math.random() * (profile.maxAge - profile.minAge),
    profileId,
  }
  state.pollen.push(particle)
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Per-frame tick: age particles, remove expired ones (swap-with-last for O(1)),
 * and drift all survivors in the current wind direction.
 *
 * Called from the rAF onFrame handler — runs every frame, O(MAX_POLLEN).
 */
export const tickPollenDrift = (state: GameState, dt: number): void => {
  const { windSpeed, windDirection } = state.weather
  const { sx, sy } = WIND_SCREEN_VECTORS[windDirection]
  const windFraction = Math.min(windSpeed / MAX_WIND_SPEED, 1)
  const driftX = sx * windFraction * POLLEN_DRIFT_SPEED * dt
  const driftY = sy * windFraction * POLLEN_DRIFT_SPEED * dt

  let i = state.pollen.length - 1
  while (i >= 0) {
    const p = state.pollen[i]
    p.age += dt
    if (p.age >= p.maxAge) {
      // O(1) removal: overwrite slot with last element then pop
      state.pollen[i] = state.pollen[state.pollen.length - 1]
      state.pollen.pop()
    } else {
      p.x += driftX
      p.y += driftY
    }
    i--
  }
}

/**
 * Interval tick: scan visible clover tiles and probabilistically emit particles.
 * Runs every POLLEN_EMIT_INTERVAL_MS (e.g. 100 ms) — not per-frame.
 * Suppressed outside Overworld zone.
 */
export const tickPollenEmit = (state: GameState, dt: number): void => {
  if (state.currentZone !== Zone.Overworld) return

  const { windSpeed } = state.weather

  for (const [profileId, profile] of Object.entries(POLLEN_PROFILES)) {
    if (windSpeed <= profile.windThreshold) continue

    const windFraction = Math.min(
      (windSpeed - profile.windThreshold) / (MAX_WIND_SPEED - profile.windThreshold),
      1,
    )
    // Probability per tile per tick = rate × windFraction × (dt / 1000)
    const emitProb = profile.emitRate * windFraction * (dt / 1000)

    const x0 = Math.max(0, state.camera.x)
    const x1 = Math.min(state.mapWidth - 1, state.camera.x + state.viewportWidth)
    const y0 = Math.max(0, state.camera.y)
    const y1 = Math.min(state.mapHeight - 1, state.camera.y + state.viewportHeight)

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (state.pollen.length >= MAX_POLLEN) return
        if (state.map[ty]?.[tx]?.type !== TileType.Clover) continue

        const lc = state.cloverLifecycle.get(posKey(tx, ty))
        if (lc && lc.stage !== CloverStage.Healthy) continue

        if (Math.random() < emitProb) {
          spawnParticle(state, tx, ty, profileId, profile)
        }
      }
    }
  }
}

/**
 * Fire a burst of pollen particles at (fromX, fromY) when the player exits a
 * clover field. Burst size grows with pollenTrailDepth (consecutive clover steps).
 * Resets pollenTrailDepth to 0 after firing.
 */
export const emitPlayerTrailBurst = (
  state: GameState,
  fromX: number,
  fromY: number,
): void => {
  const profile = POLLEN_PROFILES.clover
  if (!profile) return

  const count = 2 + Math.min(state.pollenTrailDepth, 6)
  for (let i = 0; i < count; i++) {
    spawnParticle(state, fromX, fromY, 'clover', profile)
  }
  state.pollenTrailDepth = 0
}
