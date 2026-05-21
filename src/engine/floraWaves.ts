// Precis #17 — ceremony wave engine.
//
// A bee+clover combine no longer stamps a 3x3 patch; it enqueues a
// WaveEmission that paints clover outward in a cellNoise-jittered
// annulus every CEREMONY_WAVE_TICK_MS. The wave reads as an organic
// vine-like expansion rather than a clean disc — some tiles in the
// nominal annulus are skipped and some at radius±1 are pulled in, both
// driven by deterministic noise seeded from the wave's seedIdentity.
//
// Painted tiles inherit lineage from seedIdentity via applyParentLineage
// (no crossing — the ceremony has no primedPollen donor). Pollen-burst
// TimedEffects spawn 2-4 per tick along the leading edge for visual
// feedback. The wave removes itself from state.activeWaves once it has
// finished expanding past maxRadius with zero new tiles painted.

import { CEREMONY_WAVE_TICK_MS } from './constants'
import { ComponentType } from './ecs/types'
import { FLORA_SPECIES } from './flora/species'
import { applyParentLineage } from './flora/spread'
import { createFloraLifecycleEntry } from './floraLifecycleEntry'
import { setMapTile } from './map'
import { isInBounds, posKey } from './position'
import { FloraSpecies, TileType, Zone } from './types'
import { getCurrentEntityZone } from './zone'

import type { GameState, WaveEmission } from './types'

// Threshold for the cellNoise jitter — values below this skip painting
// at radius == currentRadius; values above (computed at radius-1 or
// radius+1) pull tiles in/out of the nominal annulus. Tuned so ~80% of
// nominal tiles paint and the boundary has a perceptibly irregular
// edge. Not playtest-tuned yet; safe starting point.
const JITTER_PAINT_THRESHOLD = 0.2
const JITTER_PULL_IN_THRESHOLD = 0.85

const POLLEN_BURSTS_PER_TICK_MIN = 2
const POLLEN_BURSTS_PER_TICK_MAX = 4

// Deterministic per-tile noise seeded by a wave's seedIdentity. Returns
// a value in [0, 1]. Uses two non-coprime mixing patterns so the noise
// has no obvious grid alignment.
const cellNoise = (seedIdentity: string, x: number, y: number): number => {
  if (seedIdentity.length === 0) return 0
  const i1 = (x * 31 + y * 17) % seedIdentity.length
  const i2 = (x * 53 + y * 41 + 7) % seedIdentity.length
  const a = parseInt(seedIdentity[Math.abs(i1)], 16) || 0
  const b = parseInt(seedIdentity[Math.abs(i2)], 16) || 0
  return ((a * 16 + b) % 256) / 256
}

const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by))

// Returns true if the tile at (x, y) is paintable by a ceremony wave.
// Skips water, walls, sand, space, and existing flora — the wave only
// converts open Dirt tiles. Stays inside map bounds.
const isPaintableTile = (state: GameState, x: number, y: number): boolean => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return false
  const tile = state.map[y][x]
  if (tile.type !== TileType.Dirt) return false
  const key = posKey(x, y)
  if (state.ponds.has(key) || state.rivers.has(key)) return false
  return true
}

// Decide whether a tile is part of this tick's painted set. A tile at
// exactly currentRadius is painted unless cellNoise says skip; tiles at
// currentRadius-1 are also eligible if cellNoise pulls them in (only
// happens for tiles inside the boundary, so already-painted tiles are
// re-evaluated harmlessly — the isPaintableTile gate rejects them).
const isInThisAnnulus = (
  wave: WaveEmission,
  x: number,
  y: number,
): boolean => {
  const d = chebyshevDistance(x, y, wave.cx, wave.cy)
  if (d === wave.currentRadius) {
    return cellNoise(wave.seedIdentity, x, y) >= JITTER_PAINT_THRESHOLD
  }
  if (d === wave.currentRadius - 1) {
    return cellNoise(wave.seedIdentity, x, y) >= JITTER_PULL_IN_THRESHOLD
  }
  return false
}

const spawnPollenBurst = (state: GameState, x: number, y: number, time: number): void => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'pollenBurst', startTime: time })
  state.world.addComponent(e, ComponentType.EntityTag, 'pollenBurst')
  state.world.addComponent(e, ComponentType.EntityZone, getCurrentEntityZone(state))
}

const advanceWave = (state: GameState, wave: WaveEmission, time: number): number => {
  wave.currentRadius += 1
  const r = wave.currentRadius
  const binomial = FLORA_SPECIES[FloraSpecies.Clover].latinBinomial
  let painted = 0
  const leadingTiles: { x: number; y: number }[] = []

  // Scan the bounding square of the annulus. Bounded by map size on
  // both sides so a wave on a map corner doesn't iterate off-grid.
  const minX = Math.max(0, wave.cx - r)
  const maxX = Math.min(state.mapWidth - 1, wave.cx + r)
  const minY = Math.max(0, wave.cy - r)
  const maxY = Math.min(state.mapHeight - 1, wave.cy + r)

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = chebyshevDistance(x, y, wave.cx, wave.cy)
      // Skip the interior outright — we only iterate radius and
      // radius-1 candidates (the pull-in band).
      if (d < r - 1 || d > r) continue
      if (!isInThisAnnulus(wave, x, y)) continue
      if (!isPaintableTile(state, x, y)) continue

      const key = posKey(x, y)
      const { identity, traits } = applyParentLineage(wave.seedIdentity, binomial, key, time)
      setMapTile(state, x, y, { type: TileType.Flora })
      state.floraLifecycle.set(
        key,
        createFloraLifecycleEntry({
          time: 0,
          hasLight: true,
          species: FloraSpecies.Clover,
          identity,
          traits,
        }),
      )
      painted++
      if (d === r) leadingTiles.push({ x, y })
    }
  }

  // 2-4 pollen bursts scattered on the leading annulus this tick.
  if (leadingTiles.length > 0) {
    const burstCount =
      POLLEN_BURSTS_PER_TICK_MIN +
      Math.floor(Math.random() * (POLLEN_BURSTS_PER_TICK_MAX - POLLEN_BURSTS_PER_TICK_MIN + 1))
    for (let i = 0; i < burstCount; i++) {
      const pick = leadingTiles[Math.floor(Math.random() * leadingTiles.length)]
      spawnPollenBurst(state, pick.x, pick.y, time)
    }
  }

  return painted
}

// One scheduled tick of ceremony-wave advancement across every active
// wave. Each wave fires no more than once per CEREMONY_WAVE_TICK_MS to
// give the radial expansion a perceptible cadence. Waves remove
// themselves once they advance past maxRadius and paint zero new tiles.
export const tickFloraWaves = (state: GameState, time: number): void => {
  if (state.currentZone !== Zone.Overworld) return
  if (state.activeWaves.length === 0) return

  const survivors: WaveEmission[] = []
  for (const wave of state.activeWaves) {
    if (time - wave.lastTickTime < CEREMONY_WAVE_TICK_MS) {
      survivors.push(wave)
      continue
    }
    const painted = advanceWave(state, wave, time)
    wave.lastTickTime = time
    // Keep the wave alive while it's still inside maxRadius. Past
    // maxRadius, the wave only survives if it painted at least one
    // tile this tick (gives jittered boundaries a chance to catch up
    // before the wave retires).
    if (wave.currentRadius <= wave.maxRadius || painted > 0) {
      survivors.push(wave)
    }
  }
  state.activeWaves = survivors
}
