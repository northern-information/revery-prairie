import { CAVE_VISION_RADIUS, DISCOVERY_RADIUS, RUIN_VISION_RADIUS } from './constants'
import { isInBounds, posKey } from './position'
import { TileType, Zone } from './types'

import type { GameState, Tile } from './types'

/**
 * Tile visibility state for fog of war.
 * - 'unexplored': never seen — renders as black
 * - 'partiallyDiscovered': was once in player FOV but never within DISCOVERY_RADIUS
 *   — terrain at reduced brightness, entities/effects hidden ("dim memory")
 * - 'fullyDiscovered': was once within DISCOVERY_RADIUS of the player AND in LOS
 *   — terrain and live entities at full brightness even when out of LOS (permanent)
 * - 'visible': currently in line-of-sight — full rendering with cursor/effects
 */
export type TileVisibility = 'unexplored' | 'partiallyDiscovered' | 'fullyDiscovered' | 'visible'

/** Returns true if the given zone has fog of war. */
export const hasFogOfWar = (zone: string): boolean => zone === Zone.Cave || zone === Zone.Ruin

/** Returns true if a tile type blocks line-of-sight. */
export const blocksLOS = (tileType: TileType): boolean =>
  tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall || tileType === TileType.RuinWall

/**
 * Compute field of view from a given origin using symmetric shadowcasting.
 * Returns the set of visible tile keys.
 *
 * The algorithm scans in 4 cardinal quadrants. For each quadrant it walks
 * outward row-by-row (column-by-column), tracking which angular slices
 * are still open. A tile is visible if its center falls within an open
 * slice and the tile is within `radius` Chebyshev distance.
 *
 * Walls are included in the visible set (you can see the wall face) but
 * block vision beyond them.
 */
export const computeFOV = (
  originX: number,
  originY: number,
  radius: number,
  map: Tile[][],
  mapWidth: number,
  mapHeight: number
): Set<string> => {
  const visible = new Set<string>()

  // Origin is always visible
  if (isInBounds(originX, originY, mapWidth, mapHeight)) {
    visible.add(posKey(originX, originY))
  }

  // Scan each quadrant using the row/column transform:
  // quadrant 0: ( row,  col) → (+dy, +dx)
  // quadrant 1: ( row,  col) → (+dy, -dx)
  // quadrant 2: ( row,  col) → (-dy, +dx)
  // quadrant 3: ( row,  col) → (-dy, -dx)
  // We also scan the transposed quadrants (swap row/col axes)
  const transforms = [
    (row: number, col: number) => ({ x: originX + col, y: originY + row }),
    (row: number, col: number) => ({ x: originX + col, y: originY - row }),
    (row: number, col: number) => ({ x: originX - col, y: originY + row }),
    (row: number, col: number) => ({ x: originX - col, y: originY - row }),
    (row: number, col: number) => ({ x: originX + row, y: originY + col }),
    (row: number, col: number) => ({ x: originX + row, y: originY - col }),
    (row: number, col: number) => ({ x: originX - row, y: originY + col }),
    (row: number, col: number) => ({ x: originX - row, y: originY - col }),
  ]

  for (const transform of transforms) {
    scanOctant(1, 1.0, 0.0, radius, map, mapWidth, mapHeight, transform, visible)
  }

  return visible
}

/**
 * Recursive shadowcasting for one octant.
 * Uses slope-based shadow tracking with symmetric visibility.
 */
const scanOctant = (
  row: number,
  startSlope: number,
  endSlope: number,
  radius: number,
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  transform: (row: number, col: number) => { x: number; y: number },
  visible: Set<string>
): void => {
  if (startSlope < endSlope) return

  let currentStart = startSlope

  for (let r = row; r <= radius; r++) {
    let blocked = false
    const minCol = Math.round(r * endSlope)
    const maxCol = Math.round(r * currentStart)

    for (let col = maxCol; col >= minCol; col--) {
      const { x, y } = transform(r, col)

      if (!isInBounds(x, y, mapWidth, mapHeight)) continue

      // Chebyshev distance check for circular-ish FOV
      if (r * r + col * col > (radius + 0.5) * (radius + 0.5)) continue

      const leftSlope = (col + 0.5) / (r - 0.5)
      const rightSlope = (col - 0.5) / (r + 0.5)

      if (currentStart < rightSlope) continue
      if (endSlope > leftSlope) continue

      // Tile is visible
      visible.add(posKey(x, y))

      const tileType = map[y][x].type
      const isBlocking = blocksLOS(tileType)

      if (blocked) {
        if (isBlocking) {
          // Still in a wall — update the shadow's start slope
          currentStart = rightSlope
        } else {
          // Exited a wall — start a new scan from here
          blocked = false
          currentStart = (col + 0.5) / (r - 0.5)
        }
      } else {
        if (isBlocking && r < radius) {
          // Entering a wall — recurse for the open region above, then mark blocked
          blocked = true
          scanOctant(r + 1, currentStart, (col + 0.5) / (r + 0.5), radius, map, mapWidth, mapHeight, transform, visible)
          currentStart = rightSlope
        }
      }
    }

    if (blocked) break
  }
}

/**
 * Get the fog state sets and illumination map for the current zone.
 * Cave uses GameState fields; Ruin uses per-interior fields.
 * Returns null if the current zone has no fog of war.
 *
 * - fogExplored: tiles ever in player FOV (drives partiallyDiscovered)
 * - fogDiscovered: tiles ever within DISCOVERY_RADIUS AND in LOS (drives fullyDiscovered)
 * - fogIllumination: temporary revery illumination → expiration time
 */
const getFogState = (
  state: GameState
): {
  fogExplored: Set<string>
  fogDiscovered: Set<string>
  fogIllumination: Map<string, number>
} | null => {
  if (state.currentZone === Zone.Cave) {
    return {
      fogExplored: state.caveFogExplored,
      fogDiscovered: state.caveFogDiscovered,
      fogIllumination: state.caveFogIllumination,
    }
  }
  if (state.currentZone === Zone.Ruin && state.currentRuinIndex !== null) {
    const interior = state.ruinInteriors[state.currentRuinIndex]
    if (interior) {
      return {
        fogExplored: interior.fogExplored,
        fogDiscovered: interior.fogDiscovered,
        fogIllumination: interior.fogIllumination,
      }
    }
  }
  return null
}

/**
 * Get the visibility state of a tile for fog of war.
 * Returns 'visible', 'fullyDiscovered', 'partiallyDiscovered', or 'unexplored'.
 *
 * Priority: visible (currently in LOS / illuminated) wins over fullyDiscovered;
 * fullyDiscovered (was within DISCOVERY_RADIUS in LOS) wins over
 * partiallyDiscovered (was once in FOV); else unexplored.
 */
export const getTileVisibility = (state: GameState, x: number, y: number, visibleSet: Set<string>): TileVisibility => {
  if (!hasFogOfWar(state.currentZone)) return 'visible'

  const key = posKey(x, y)
  if (visibleSet.has(key)) return 'visible'

  const fog = getFogState(state)
  if (fog?.fogDiscovered.has(key)) return 'fullyDiscovered'
  if (fog?.fogExplored.has(key)) return 'partiallyDiscovered'
  return 'unexplored'
}

// Last computed visible set for the current frame. Cached so the fog mask
// pass (world-overlay) and the central tile loop can share one result
// without recomputing FOV. Sidebar also reads it for cursor info.
let _lastVisibleSet: Set<string> | null = null

export const getLastVisibleSet = (): Set<string> | null => _lastVisibleSet

/**
 * Compute the full visible set for the current frame.
 * Unions player vision with any active illumination sources (revery effects).
 * Also updates the fog explored set with newly visible tiles.
 *
 * Returns an empty set if the current zone has no fog of war
 * (caller should treat all tiles as visible).
 */
export const computeZoneVisibility = (state: GameState): Set<string> => {
  const fog = getFogState(state)
  if (!fog) {
    _lastVisibleSet = null
    return new Set()
  }

  const { player, map, mapWidth, mapHeight } = state

  // Pick vision radius based on zone
  const radius = state.currentZone === Zone.Ruin ? RUIN_VISION_RADIUS : CAVE_VISION_RADIUS

  // Player's natural vision (separate from total visible — used below for
  // fullyDiscovered promotion, since revery illumination must not promote)
  const playerFOV = computeFOV(player.x, player.y, radius, map, mapWidth, mapHeight)
  const visible = new Set(playerFOV)

  // Add illumination from revery effects (fire, lightning)
  for (const key of fog.fogIllumination.keys()) {
    visible.add(key)
  }

  // Entrance is always visible (so player can always find the exit)
  let entrance: { x: number; y: number } | null = null
  if (state.currentZone === Zone.Cave) {
    entrance = state.caveEntranceInterior
  } else if (state.currentZone === Zone.Ruin && state.currentRuinIndex !== null) {
    const interior = state.ruinInteriors[state.currentRuinIndex]
    if (interior) {
      entrance = interior.entranceInterior
    }
  }
  if (entrance) {
    visible.add(posKey(entrance.x, entrance.y))
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ex = entrance.x + dx
        const ey = entrance.y + dy
        if (isInBounds(ex, ey, mapWidth, mapHeight)) {
          visible.add(posKey(ex, ey))
        }
      }
    }
  }

  // Update explored set — tiles never revert to unexplored
  for (const key of visible) {
    fog.fogExplored.add(key)
  }

  // Promote tiles within DISCOVERY_RADIUS of the player AND in the player's
  // natural FOV (LOS-checked) to fullyDiscovered. Permanent — never reverts.
  // Revery illumination is excluded by checking playerFOV (not visible),
  // so remote casts cannot full-discover tiles.
  const minX = player.x - DISCOVERY_RADIUS
  const maxX = player.x + DISCOVERY_RADIUS
  const minY = player.y - DISCOVERY_RADIUS
  const maxY = player.y + DISCOVERY_RADIUS
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!isInBounds(x, y, mapWidth, mapHeight)) continue
      const key = posKey(x, y)
      if (playerFOV.has(key)) {
        fog.fogDiscovered.add(key)
      }
    }
  }

  _lastVisibleSet = visible
  return visible
}

/** @deprecated Use computeZoneVisibility instead. Alias kept for call-site compatibility. */
export const computeCaveVisibility = computeZoneVisibility

/**
 * Add illumination from a revery effect at a given origin.
 * Computes FOV from the origin point (walls block LOS) and adds
 * all visible tiles to both the illumination map and explored set.
 *
 * @param expiresAt - timestamp when the illumination expires
 */
export const addReveryIllumination = (
  state: GameState,
  originX: number,
  originY: number,
  radius: number,
  expiresAt: number
): void => {
  const fog = getFogState(state)
  if (!fog) return

  const illuminated = computeFOV(originX, originY, radius, state.map, state.mapWidth, state.mapHeight)

  for (const key of illuminated) {
    const existing = fog.fogIllumination.get(key)
    // Keep the later expiration if already illuminated
    if (existing === undefined || existing < expiresAt) {
      fog.fogIllumination.set(key, expiresAt)
    }
    fog.fogExplored.add(key)
  }
}

/**
 * Expire old illumination entries. Call once per frame.
 */
export const tickIllumination = (state: GameState, time: number): void => {
  const fog = getFogState(state)
  if (!fog) return

  const expired: string[] = []
  for (const [key, expiresAt] of fog.fogIllumination) {
    if (time >= expiresAt) {
      expired.push(key)
    }
  }
  for (const key of expired) {
    fog.fogIllumination.delete(key)
  }
}

/**
 * Dimming helper: given an RGB hex color string, return it at reduced brightness.
 */
export const dimColor = (hex: string, brightness: number): string => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const dr = Math.round(r * brightness)
  const dg = Math.round(g * brightness)
  const db = Math.round(b * brightness)
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`
}
