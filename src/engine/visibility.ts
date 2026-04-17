import { CAVE_VISION_RADIUS } from './constants'
import { isInBounds, posKey } from './position'
import { TileType, Zone } from './types'

import type { GameState, Tile } from './types'

/**
 * Tile visibility state for fog of war.
 * - 'unexplored': never seen — renders as black
 * - 'explored': previously seen — terrain at reduced brightness, no entities
 * - 'visible': currently in line-of-sight — full rendering
 */
export type TileVisibility = 'unexplored' | 'explored' | 'visible'

/** Returns true if a tile type blocks line-of-sight in the cave. */
export const blocksLOS = (tileType: TileType): boolean =>
  tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall

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
  mapHeight: number,
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
  visible: Set<string>,
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
 * Get the visibility state of a tile in the cave.
 * Returns 'visible', 'explored', or 'unexplored'.
 */
export const getTileVisibility = (
  state: GameState,
  x: number,
  y: number,
  visibleSet: Set<string>,
): TileVisibility => {
  if (state.currentZone !== Zone.Cave) return 'visible'

  const key = posKey(x, y)
  if (visibleSet.has(key)) return 'visible'
  if (state.caveFogExplored.has(key)) return 'explored'
  return 'unexplored'
}

/**
 * Compute the full visible set for the current frame in the cave.
 * Unions player vision with any active illumination sources (revery effects).
 * Also updates caveFogExplored with newly visible tiles.
 *
 * Returns an empty set if not in cave zone (caller should treat all tiles as visible).
 */
export const computeCaveVisibility = (state: GameState): Set<string> => {
  if (state.currentZone !== Zone.Cave) return new Set()

  const { player, map, mapWidth, mapHeight } = state

  // Player's natural vision
  const visible = computeFOV(player.x, player.y, CAVE_VISION_RADIUS, map, mapWidth, mapHeight)

  // Add illumination from revery effects (fire, lightning)
  for (const key of state.caveFogIllumination.keys()) {
    visible.add(key)
  }

  // Cave entrance is always visible (so player can always find the exit)
  const entrance = state.caveEntranceInterior
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

  // Update explored set — tiles never revert to unexplored
  for (const key of visible) {
    state.caveFogExplored.add(key)
  }

  return visible
}

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
  expiresAt: number,
): void => {
  if (state.currentZone !== Zone.Cave) return

  const illuminated = computeFOV(originX, originY, radius, state.map, state.mapWidth, state.mapHeight)

  for (const key of illuminated) {
    const existing = state.caveFogIllumination.get(key)
    // Keep the later expiration if already illuminated
    if (existing === undefined || existing < expiresAt) {
      state.caveFogIllumination.set(key, expiresAt)
    }
    state.caveFogExplored.add(key)
  }
}

/**
 * Expire old illumination entries. Call once per frame.
 */
export const tickIllumination = (state: GameState, time: number): void => {
  const expired: string[] = []
  for (const [key, expiresAt] of state.caveFogIllumination) {
    if (time >= expiresAt) {
      expired.push(key)
    }
  }
  for (const key of expired) {
    state.caveFogIllumination.delete(key)
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
