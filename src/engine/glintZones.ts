import {
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
import { posKey } from './position'
import { TileType } from './types'

import type { GameState, GlintPatch, Tile } from './types'

const TOTAL_LIFECYCLE_MS = GLINT_ZONE_FADE_IN_MS + GLINT_ZONE_HOLD_MS + GLINT_ZONE_FADE_OUT_MS

const computePatchTiles = (
  map: Tile[][],
  cx: number,
  cy: number,
  radius: number,
  width: number,
  height: number,
): Set<string> => {
  const tiles = new Set<string>()
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue
      const tx = cx + dx
      const ty = cy + dy
      if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue
      const tile = map[ty][tx].type
      if (tile === TileType.Dirt || tile === TileType.Clover) {
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
    if (map[cy][cx].type !== TileType.Dirt && map[cy][cx].type !== TileType.Clover) continue
    const radius =
      GLINT_ZONE_RADIUS_MIN +
      Math.floor(Math.random() * (GLINT_ZONE_RADIUS_MAX - GLINT_ZONE_RADIUS_MIN + 1))
    const tiles = computePatchTiles(map, cx, cy, radius, mapWidth, mapHeight)
    if (tiles.size === 0) continue
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

export const seedGlintPatches = (state: GameState, time: number): void => {
  state.glintPatches = []
  for (let i = 0; i < GLINT_ZONE_COUNT; i++) {
    const birthTime = time - i * (TOTAL_LIFECYCLE_MS / GLINT_ZONE_COUNT)
    const patch = spawnGlintPatch(state, birthTime)
    if (patch) {
      state.glintPatches.push(patch)
    }
  }
  state.lastGlintSpawnTime = time
}

export const tickGlintZones = (state: GameState, time: number): void => {
  // 1. Remove expired patches
  state.glintPatches = state.glintPatches.filter((patch) => {
    const elapsed = time - patch.birthTime
    return elapsed < TOTAL_LIFECYCLE_MS
  })

  // 2. Drift patches in hold phase
  for (const patch of state.glintPatches) {
    const elapsed = time - patch.birthTime
    const inHold =
      elapsed >= GLINT_ZONE_FADE_IN_MS &&
      elapsed < GLINT_ZONE_FADE_IN_MS + GLINT_ZONE_HOLD_MS
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
      if (tile === TileType.Dirt || tile === TileType.Clover) {
        patch.centerX = newCx
        patch.centerY = newCy
        patch.tiles = computePatchTiles(
          state.map,
          newCx,
          newCy,
          patch.radius,
          state.mapWidth,
          state.mapHeight,
        )
      }
    }
    patch.lastDriftTime = time
  }

  // 3. Spawn new patch if below cap
  if (
    state.glintPatches.length < GLINT_ZONE_COUNT &&
    time - state.lastGlintSpawnTime >= GLINT_ZONE_SPAWN_MS
  ) {
    const patch = spawnGlintPatch(state, time)
    if (patch) {
      state.glintPatches.push(patch)
    }
    state.lastGlintSpawnTime = time
  }

  // 4. Rebuild glint zones from patches
  rebuildGlintZones(state, time)
}
