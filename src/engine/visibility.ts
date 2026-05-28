import { ANGEL_AURA_RADIUS, CAVE_VISION_RADIUS, OVERWORLD_VISION_RADIUS, RUIN_VISION_RADIUS } from './constants'
import { ComponentType } from './ecs/types'
import { isInBounds, posKey } from './position'
import { TileType, Zone } from './types'

import type { FloraMemoryEntry, GameState, Tile } from './types'

/**
 * Tile visibility state for fog of war (RP-62 — "fog returns to memory").
 * - 'unexplored': never seen — renders as black ("unseen")
 * - 'remembered': was once in player FOV but is not currently in line-of-sight
 *   — dim memory: terrain, static landmarks, and a frozen flora snapshot at
 *   reduced brightness; live creatures and live effects hidden
 * - 'visible': currently in line-of-sight — full rendering with all entities,
 *   effects, and cursor ("gaze")
 *
 * The fog returns the moment the player looks away — there is no
 * permanently-bright tier. Player-facing vocabulary: gaze / memory / unseen.
 */
export type TileVisibility = 'unexplored' | 'remembered' | 'visible'

/** Returns true if the given zone has fog of war. */
export const hasFogOfWar = (zone: string): boolean =>
  zone === Zone.Cave || zone === Zone.Ruin || zone === Zone.Overworld

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
 * Get the fog explored set for the current zone.
 * Cave/Overworld use GameState fields; Ruin uses the per-interior field.
 * Returns null if the current zone has no fog of war.
 *
 * fogExplored is the single "ever seen" set that drives `remembered`
 * (RP-62 — there is no separate fully-discovered tier).
 */
const getFogState = (state: GameState): { fogExplored: Set<string> } | null => {
  if (state.currentZone === Zone.Cave) {
    return { fogExplored: state.caveFogExplored }
  }
  if (state.currentZone === Zone.Overworld) {
    return { fogExplored: state.overworldFogExplored }
  }
  if (state.currentZone === Zone.Ruin && state.currentRuinIndex !== null) {
    const interior = state.ruinInteriors[state.currentRuinIndex]
    if (interior) {
      return { fogExplored: interior.fogExplored }
    }
  }
  return null
}

/**
 * Get the flora-memory map for the current zone (RP-62). Mirrors
 * getFogState's zone routing. The renderer writes the live appearance of
 * each visible flora/egregore tile here and reads it back (dimmed) while
 * the tile is remembered. Returns null if the zone has no fog of war.
 */
export const getZoneFloraMemory = (state: GameState): Map<string, FloraMemoryEntry> | null => {
  if (state.currentZone === Zone.Cave) return state.caveFloraMemory
  if (state.currentZone === Zone.Overworld) return state.overworldFloraMemory
  if (state.currentZone === Zone.Ruin && state.currentRuinIndex !== null) {
    return state.ruinInteriors[state.currentRuinIndex]?.floraMemory ?? null
  }
  return null
}

/**
 * Get the visibility state of a tile for fog of war (RP-62).
 * Returns 'visible', 'remembered', or 'unexplored'.
 *
 * Priority: visible (currently in LOS / illuminated) wins; else remembered
 * (ever seen) wins; else unexplored.
 */
export const getTileVisibility = (state: GameState, x: number, y: number, visibleSet: Set<string>): TileVisibility => {
  if (!hasFogOfWar(state.currentZone)) return 'visible'

  const key = posKey(x, y)
  if (visibleSet.has(key)) return 'visible'

  const fog = getFogState(state)
  if (fog?.fogExplored.has(key)) return 'remembered'
  return 'unexplored'
}

// Last computed visible set for the current frame. Cached so the fog mask
// pass (world-overlay) and the central tile loop can share one result
// without recomputing FOV.
let _lastVisibleSet: Set<string> | null = null

export const getLastVisibleSet = (): Set<string> | null => _lastVisibleSet

/**
 * Compute the full visible set for the current frame.
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

  // Pick vision radius based on zone. All three radii are equal today
  // (RP-38 — "same eyes, indoors or out") but stay named separately
  // so future tuning per zone is a one-line change.
  let radius: number
  if (state.currentZone === Zone.Ruin) {
    radius = RUIN_VISION_RADIUS
  } else if (state.currentZone === Zone.Overworld) {
    radius = OVERWORLD_VISION_RADIUS
  } else {
    radius = CAVE_VISION_RADIUS
  }

  const playerFOV = computeFOV(player.x, player.y, radius, map, mapWidth, mapHeight)
  const visible = new Set(playerFOV)

  // Entrance is always visible (so player can always find the exit).
  // Overworld has no entrance — orientation comes from the player's
  // own movement and the minimap.
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

  // Standing inside an angel's aura reveals the entire aura circle —
  // the angel's gaze lights up the field around it for the steward.
  // Reveal is symmetric with player FOV: tiles enter `visible` for the
  // current frame and are promoted to fullyDiscovered below.
  if (state.currentZone === Zone.Overworld) {
    const r2 = ANGEL_AURA_RADIUS * ANGEL_AURA_RADIUS
    for (const eid of state.world.query(ComponentType.AngelData, ComponentType.Position)) {
      const pos = state.world.getComponent(eid, ComponentType.Position)
      if (!pos) continue
      const pdx = player.x - pos.x
      const pdy = player.y - pos.y
      if (pdx * pdx + pdy * pdy > r2) continue
      for (let dy = -ANGEL_AURA_RADIUS; dy <= ANGEL_AURA_RADIUS; dy++) {
        for (let dx = -ANGEL_AURA_RADIUS; dx <= ANGEL_AURA_RADIUS; dx++) {
          if (dx * dx + dy * dy > r2) continue
          const tx = pos.x + dx
          const ty = pos.y + dy
          if (!isInBounds(tx, ty, mapWidth, mapHeight)) continue
          visible.add(posKey(tx, ty))
        }
      }
    }
  }

  // Update explored set — tiles never revert to unexplored. This is the
  // single fog set now (RP-62): every visible tile becomes `remembered`
  // (dim memory) the moment it leaves gaze. There is no proximity-promotion
  // step and no permanently-bright tier.
  for (const key of visible) {
    fog.fogExplored.add(key)
  }

  _lastVisibleSet = visible
  return visible
}

/** @deprecated Use computeZoneVisibility instead. Alias kept for call-site compatibility. */
export const computeCaveVisibility = computeZoneVisibility

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
