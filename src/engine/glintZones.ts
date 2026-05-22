import {
  GLINT_BEAM_CHANCE,
  GLINT_BEAM_CYCLE_MS,
  GLINT_BEAM_LENGTH_MAX,
  GLINT_BEAM_LENGTH_MIN,
  GLINT_BEAM_MAX_OPACITY,
  GLINT_BEAM_TAIL_OPACITY,
  GLINT_PATCH_MIN_TILES,
  GLINT_ZONE_COUNT,
  GLINT_ZONE_DRIFT_MS,
  GLINT_ZONE_FADE_IN_MS,
  GLINT_ZONE_FADE_OUT_MS,
  GLINT_ZONE_HOLD_MS,
  GLINT_ZONE_RADIUS_MAX,
  GLINT_ZONE_RADIUS_MIN,
  GLINT_ZONE_SPAWN_MS,
  SPACE_BORDER,
} from './constants'
import { posKey, tileHash } from './position'
import { TileType } from './types'

import type { GameState, GlintPatch, Tile } from './types'

const TOTAL_LIFECYCLE_MS = GLINT_ZONE_FADE_IN_MS + GLINT_ZONE_HOLD_MS + GLINT_ZONE_FADE_OUT_MS

const computePatchTiles = (
  map: Tile[][],
  cx: number,
  cy: number,
  radius: number,
  width: number,
  height: number
): Set<string> => {
  const tiles = new Set<string>()
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue
      const tx = cx + dx
      const ty = cy + dy
      if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue
      const tile = map[ty][tx].type
      if (tile === TileType.Dirt || tile === TileType.Flora) {
        tiles.add(posKey(tx, ty))
      }
    }
  }
  return tiles
}

export const spawnGlintPatch = (state: GameState, birthTime: number): GlintPatch | null => {
  const { map, mapWidth, mapHeight } = state
  for (let attempt = 0; attempt < 50; attempt++) {
    const cx = SPACE_BORDER + Math.floor(Math.random() * (mapWidth - SPACE_BORDER * 2))
    const cy = SPACE_BORDER + Math.floor(Math.random() * (mapHeight - SPACE_BORDER * 2))
    if (map[cy][cx].type !== TileType.Dirt && map[cy][cx].type !== TileType.Flora) continue
    const radius =
      GLINT_ZONE_RADIUS_MIN + Math.floor(Math.random() * (GLINT_ZONE_RADIUS_MAX - GLINT_ZONE_RADIUS_MIN + 1))
    const tiles = computePatchTiles(map, cx, cy, radius, mapWidth, mapHeight)
    if (tiles.size < GLINT_PATCH_MIN_TILES) continue
    return {
      centerX: cx,
      centerY: cy,
      radius,
      birthTime,
      lastDriftTime: birthTime,
      tiles,
    }
  }
  return null
}

export const rebuildGlintZones = (state: GameState, time: number): void => {
  state.glintZones.clear()
  state.glintOpacity.clear()

  for (const patch of state.glintPatches) {
    const elapsed = time - patch.birthTime
    let opacity: number

    if (elapsed < GLINT_ZONE_FADE_IN_MS) {
      // fade-in phase
      opacity = elapsed / GLINT_ZONE_FADE_IN_MS
    } else if (elapsed < GLINT_ZONE_FADE_IN_MS + GLINT_ZONE_HOLD_MS) {
      // hold phase
      opacity = 1.0
    } else {
      // fade-out phase
      const fadeElapsed = elapsed - GLINT_ZONE_FADE_IN_MS - GLINT_ZONE_HOLD_MS
      opacity = 1.0 - fadeElapsed / GLINT_ZONE_FADE_OUT_MS
    }

    opacity = Math.max(0, Math.min(1, opacity))
    if (opacity <= 0) continue

    for (const key of patch.tiles) {
      state.glintZones.add(key)
      const existing = state.glintOpacity.get(key) ?? 0
      state.glintOpacity.set(key, Math.max(existing, opacity))
    }
  }
}

// Patches are seeded with birth times staggered FORWARD from `time`,
// so patch 0 enters fade-in immediately and patches 1..N-1 start later.
// rebuildGlintZones clamps negative-elapsed values to opacity 0, so
// future-birthtime patches sit invisible until their turn arrives.
// Subtractive stagger (the previous behavior) made patches appear
// pre-aged at full opacity at the genesis-to-gameplay handoff.
export const seedGlintPatches = (state: GameState, time: number): void => {
  state.glintPatches = []
  for (let i = 0; i < GLINT_ZONE_COUNT; i++) {
    const birthTime = time + i * (TOTAL_LIFECYCLE_MS / GLINT_ZONE_COUNT)
    const patch = spawnGlintPatch(state, birthTime)
    if (patch) {
      state.glintPatches.push(patch)
    }
  }
  state.lastGlintSpawnTime = time
}

export const tickGlintZones = (state: GameState, time: number): void => {
  // 1. Remove expired patches
  state.glintPatches = state.glintPatches.filter(patch => {
    const elapsed = time - patch.birthTime
    return elapsed < TOTAL_LIFECYCLE_MS
  })

  // 2. Drift patches in hold phase
  for (const patch of state.glintPatches) {
    const elapsed = time - patch.birthTime
    const inHold = elapsed >= GLINT_ZONE_FADE_IN_MS && elapsed < GLINT_ZONE_FADE_IN_MS + GLINT_ZONE_HOLD_MS
    if (!inHold) continue
    if (time - patch.lastDriftTime < GLINT_ZONE_DRIFT_MS) continue

    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ]
    const dir = dirs[Math.floor(Math.random() * dirs.length)]
    const newCx = patch.centerX + dir.dx
    const newCy = patch.centerY + dir.dy
    if (
      newCx >= SPACE_BORDER &&
      newCx < state.mapWidth - SPACE_BORDER &&
      newCy >= SPACE_BORDER &&
      newCy < state.mapHeight - SPACE_BORDER
    ) {
      const tile = state.map[newCy][newCx].type
      if (tile === TileType.Dirt || tile === TileType.Flora) {
        const candidate = computePatchTiles(state.map, newCx, newCy, patch.radius, state.mapWidth, state.mapHeight)
        if (candidate.size >= GLINT_PATCH_MIN_TILES) {
          patch.centerX = newCx
          patch.centerY = newCy
          patch.tiles = candidate
        }
      }
    }
    patch.lastDriftTime = time
  }

  // 3. Spawn new patch if below cap
  if (state.glintPatches.length < GLINT_ZONE_COUNT && time - state.lastGlintSpawnTime >= GLINT_ZONE_SPAWN_MS) {
    const patch = spawnGlintPatch(state, time)
    if (patch) {
      state.glintPatches.push(patch)
    }
    state.lastGlintSpawnTime = time
  }

  // 4. Rebuild glint zones from patches
  rebuildGlintZones(state, time)
}

// Beam offsets keep beam selection decorrelated from the sparkle hash
// (which uses a different seed combination in the renderer).
const BEAM_PRESENCE_OFFSET = 9173
const BEAM_LENGTH_OFFSET = 4099
const BEAM_MAX_OPACITY_OFFSET = 7919

/**
 * Stable per-tile decision: does this tile show a light beam? ~30% true.
 * Same (x, y, seed) always returns the same result.
 */
export const tileHasBeam = (x: number, y: number, seed: number): boolean => {
  const h = tileHash(x + seed, y + BEAM_PRESENCE_OFFSET)
  // Use modulo bucketing for a robust uniform distribution; tileHash's
  // higher bits show bias due to JS multiplication precision loss.
  return h % 1000 < Math.round(GLINT_BEAM_CHANCE * 1000)
}

/**
 * Stable per-tile beam length in [GLINT_BEAM_LENGTH_MIN, GLINT_BEAM_LENGTH_MAX].
 */
export const tileBeamLength = (x: number, y: number, seed: number): number => {
  const h = tileHash(x + seed + BEAM_LENGTH_OFFSET, y)
  const range = GLINT_BEAM_LENGTH_MAX - GLINT_BEAM_LENGTH_MIN + 1
  return GLINT_BEAM_LENGTH_MIN + (h % range)
}

/**
 * Stable per-tile peak opacity for the beam's brightest segment, in
 * [0, GLINT_BEAM_MAX_OPACITY]. Each beam picks its own cap so the
 * field of beams varies subtly in intensity.
 */
export const tileBeamMaxOpacity = (x: number, y: number, seed: number): number => {
  const h = tileHash(x + seed + BEAM_MAX_OPACITY_OFFSET, y)
  return ((h % 1000) / 1000) * GLINT_BEAM_MAX_OPACITY
}

const BEAM_BUILD_FRACTION = 0.55
const BEAM_HOLD_FRACTION = 0.15

/**
 * Pour-phase opacity for a beam segment, in [0, 1]. The beam builds
 * top-down for the first BEAM_BUILD_FRACTION of the cycle, holds briefly,
 * then collapses top-down over the remainder. Intensity also falls off
 * from the top of the beam (full strength) to the bottom (scaled to
 * GLINT_BEAM_TAIL_OPACITY) — light dims as it pours toward the ground.
 *
 * The returned value is the unscaled pour profile; callers multiply by
 * the per-beam max opacity (tileBeamMaxOpacity) and patch phase opacity
 * to get final alpha.
 *
 * @param segmentIndex 0 = closest to glinting tile (bottom), length-1 = topmost
 * @param length total beam segments
 * @param time current animation time (ms)
 */
export const computeBeamSegmentOpacity = (segmentIndex: number, length: number, time: number): number => {
  if (length <= 0) return 0
  const distFromTop = length - 1 - segmentIndex
  const cyclePhase = (time % GLINT_BEAM_CYCLE_MS) / GLINT_BEAM_CYCLE_MS

  const collapseFraction = 1 - BEAM_BUILD_FRACTION - BEAM_HOLD_FRACTION
  const buildStart = (distFromTop / length) * BEAM_BUILD_FRACTION
  const buildEnd = ((distFromTop + 1) / length) * BEAM_BUILD_FRACTION
  const collapseBase = BEAM_BUILD_FRACTION + BEAM_HOLD_FRACTION
  const collapseStart = collapseBase + (distFromTop / length) * collapseFraction
  const collapseEnd = collapseBase + ((distFromTop + 1) / length) * collapseFraction

  let phaseOpacity: number
  if (cyclePhase < buildStart) {
    phaseOpacity = 0
  } else if (cyclePhase < buildEnd) {
    phaseOpacity = (cyclePhase - buildStart) / (buildEnd - buildStart)
  } else if (cyclePhase < collapseStart) {
    phaseOpacity = 1
  } else if (cyclePhase < collapseEnd) {
    phaseOpacity = 1 - (cyclePhase - collapseStart) / (collapseEnd - collapseStart)
  } else {
    phaseOpacity = 0
  }

  // Top-to-bottom falloff: top is full strength, bottom dims to TAIL_OPACITY.
  const topness = length === 1 ? 1 : 1 - distFromTop / (length - 1)
  const falloff = GLINT_BEAM_TAIL_OPACITY + topness * (1 - GLINT_BEAM_TAIL_OPACITY)

  return Math.max(0, Math.min(1, phaseOpacity * falloff))
}
