import { recordDiscovery } from '@/engine/manual'
import { Zone } from '@/engine/types'
import { getWindAt, MAX_WIND_SPEED } from '@/engine/weather/wind'
import type { FloraPollinateProfile, GameState, PollenParticle } from '@/engine/types'

// ─── constants ────────────────────────────────────────────────────────────────

export const MAX_POLLEN = 150

// Drift distance per ms per unit of normalized wind speed.
const POLLEN_DRIFT_SPEED = 0.015

// Per-frame random nudge — prevents particles feeling mechanically locked to a rail.
const TURBULENCE = 0.000018

// ─── registry ─────────────────────────────────────────────────────────────────

const pollinateRegistry = new Map<string, FloraPollinateProfile>()

export const registerFloraPollinate = (tileType: string, profile: FloraPollinateProfile): void => {
  pollinateRegistry.set(tileType, profile)
}

export const getFloraPollinate = (tileType: string): FloraPollinateProfile | undefined =>
  pollinateRegistry.get(tileType)

export const unregisterFloraPollinate = (tileType: string): void => {
  pollinateRegistry.delete(tileType)
}

// ─── particle helpers ─────────────────────────────────────────────────────────

const spawnParticle = (
  state: GameState,
  tx: number,
  ty: number,
  profileId: string,
  profile: FloraPollinateProfile,
  spread = 0.5,
  lifetimeScale = 1.0
): void => {
  if (state.pollen.length >= MAX_POLLEN) return
  const particle: PollenParticle = {
    x: tx + (Math.random() - 0.5) * spread * 2,
    y: ty + (Math.random() - 0.5) * spread * 2,
    age: 0,
    maxAge: (profile.minAge + Math.random() * (profile.maxAge - profile.minAge)) * lifetimeScale,
    profileId,
  }
  state.pollen.push(particle)
  recordDiscovery(state, 'event:pollen')
}

// ─── public API ───────────────────────────────────────────────────────────────

// Per-frame tick: age particles, remove expired (O(1) swap-with-last), drift survivors.
// Uses smooth wind direction so random-angle gusts don't scatter pollen sideways;
// uses total speed for amplitude so gusts visibly accelerate drift.
export const tickPollenDrift = (state: GameState, dt: number): void => {
  if (state.pollen.length === 0) return

  const wind = getWindAt(state, 0, 0)
  const smoothSpeed = wind.speed
  const hasDrift = smoothSpeed >= 0.01

  let driftX = 0
  let driftY = 0
  if (hasDrift) {
    const sx = wind.sx / smoothSpeed
    const sy = wind.sy / smoothSpeed
    const windFraction = Math.min(wind.totalSpeed / MAX_WIND_SPEED, 1)
    driftX = sx * windFraction * POLLEN_DRIFT_SPEED * dt
    driftY = sy * windFraction * POLLEN_DRIFT_SPEED * dt
  }

  let i = state.pollen.length - 1
  while (i >= 0) {
    const p = state.pollen[i]
    p.age += dt
    if (p.age >= p.maxAge) {
      state.pollen[i] = state.pollen[state.pollen.length - 1]
      state.pollen.pop()
    } else if (hasDrift) {
      p.x += driftX
      p.y += driftY
      p.x += (Math.random() - 0.5) * TURBULENCE * dt
      p.y += (Math.random() - 0.5) * TURBULENCE * dt
    }
    i--
  }
}

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

    const windFraction = Math.min((windSpeed - profile.windThreshold) / (MAX_WIND_SPEED - profile.windThreshold), 1)
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

export const emitPlayerFootstep = (state: GameState, fromX: number, fromY: number, tileType: string): void => {
  const profile = pollinateRegistry.get(tileType)
  if (!profile) return
  const count = 1 + Math.floor(Math.random() * 2)
  for (let i = 0; i < count; i++) {
    spawnParticle(state, fromX, fromY, tileType, profile, 0.3, 1.0)
  }
}

export const emitPlayerTrailBurst = (state: GameState, fromX: number, fromY: number, tileType: string): void => {
  const profile = pollinateRegistry.get(tileType)
  if (!profile) return

  const count = 5 + Math.min(state.pollenTrailDepth, 8)
  for (let i = 0; i < count; i++) {
    spawnParticle(state, fromX, fromY, tileType, profile, 1.5, 1.5)
  }
  state.pollenTrailDepth = 0
}
