import { TileType } from './types'

import type { Direction, Position, Tile } from './types'

export const posKey = (x: number, y: number): string => `${String(x)},${String(y)}`

export const isInBounds = (x: number, y: number, w: number, h: number): boolean => x >= 0 && x < w && y >= 0 && y < h

// 8-directional movement deltas. The 4 diagonal names follow ORIGINAL-MAP
// compass directions (NE/NW/SE/SW), not screen-axis directions, so the
// world delta in each entry matches the name.
//
// WASD wiring (screen-axis intent, mapped to the original-map diagonal
// that produces that screen motion in our iso projection):
//   w → NW (-1, -1) (visually "up" on screen)
//   s → SE (+1, +1)
//   a → SW (-1, +1)
//   d → NE (+1, -1)
export const DIRECTIONS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  upLeft: { x: -1, y: -1 }, // NW in original-map terms
  upRight: { x: 1, y: -1 }, // NE
  downLeft: { x: -1, y: 1 }, // SW
  downRight: { x: 1, y: 1 }, // SE
}

// 4-directional deltas as an array
export const CARDINAL: Position[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
]

// 8-directional deltas (cardinal + diagonal)
export const ORDINAL: Position[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
]

export const tileHash = (x: number, y: number): number => {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  h = h ^ (h >> 16)
  return h >>> 0
}

// RP-41 — adjacent-tile elevation step the steward can climb. Tiles
// whose abs(delta) on the 0-100 elevation scale exceeds this are
// unclimbable; movement and pathfinding reject the step, and the
// renderer draws a cliff-face shadow on the iso side wall.
// Picked 12 against the existing tectonic uplift amplitude
// (+18..+23 intensity, cosine falloff over radius 6) — empirical
// measurement across six seeds shows ~1-2% of adjacent pairs
// exceed this delta, producing sparse landmark-scale cliffs
// rather than warty micro-bumps. The spec originally called for
// raising amplitude alongside the threshold, but the amplitude
// bump destabilized downstream water/sand placement invariants on
// existing seeds; the threshold alone is enough to surface cliffs
// on the natural gradient.
export const CLIMBABLE_STEP_THRESHOLD = 12

// RP-41 — pure elevation-based step gate. Returns true when either
// tile lacks an elevation entry (caves, ungenerated zones, out-of-
// bounds), or when the absolute delta is within threshold. Reads
// only from the elevation map; tile types and entities are gated
// separately by isWalkableTile and the entity-block check.
export const isClimbableStep = (
  elevation: Map<string, number>,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  threshold: number = CLIMBABLE_STEP_THRESHOLD
): boolean => {
  const fromElev = elevation.get(posKey(fromX, fromY))
  const toElev = elevation.get(posKey(toX, toY))
  if (fromElev === undefined || toElev === undefined) return true
  return Math.abs(toElev - fromElev) <= threshold
}

export const isWalkableTile = (tileType: TileType): boolean =>
  tileType !== TileType.Space &&
  tileType !== TileType.CaveWall &&
  tileType !== TileType.CaveBreakableWall &&
  tileType !== TileType.RuinWall &&
  tileType !== TileType.RuinDebris &&
  tileType !== TileType.RuinDoorLocked &&
  // RP-33 — house walls and the fireplace are not walkable. The
  // bed is also not walkable for destination checks, but movement.ts
  // adds an origin-from-bed exception so the player can step off it
  // after a Revery closes. HouseHearth is walkable — the player can
  // approach the fireplace by standing on the hearth.
  tileType !== TileType.HouseWall &&
  tileType !== TileType.HouseBed &&
  tileType !== TileType.Fireplace

// Tile types reserved by a placed structure. New entity placers (oaks today,
// future multi-tile entities) must reject candidate positions whose footprint
// includes any of these — the tile already belongs to something.
export const isReservedForStructure = (tileType: TileType): boolean =>
  tileType === TileType.CaveEntrance || tileType === TileType.RuinEntrance || tileType === TileType.RuinApron

/** Find the nearest walkable tile at Chebyshev distance >= minDistance from entrance.
 *  Searches outward shell by shell, preferring south at each distance.
 *  Pass minDistance=2 when exiting a zone to land outside the 3x3 entry hitbox. */
export const findSafeExitPosition = (
  entrance: Position,
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  minDistance = 1
): Position => {
  for (let dist = minDistance; dist <= minDistance + 4; dist++) {
    const shell: Position[] = []
    for (let dy = -dist; dy <= dist; dy++) {
      for (let dx = -dist; dx <= dist; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== dist) continue
        shell.push({ x: dx, y: dy })
      }
    }
    // Priority: direct south → direct north → direct west → direct east → rest
    // (sorted by decreasing y, ascending |x| within the remainder group).
    // This matches the original single-shell ordering: S, N, W, E, SW, SE, NW, NE.
    const cardinalPriority = (off: Position): number => {
      if (off.x === 0 && off.y > 0) return 0
      if (off.x === 0 && off.y < 0) return 1
      if (off.x < 0 && off.y === 0) return 2
      if (off.x > 0 && off.y === 0) return 3
      return 4
    }
    shell.sort((a, b) => {
      const pa = cardinalPriority(a)
      const pb = cardinalPriority(b)
      if (pa !== pb) return pa - pb
      return b.y - a.y || Math.abs(a.x) - Math.abs(b.x)
    })
    for (const off of shell) {
      const nx = entrance.x + off.x
      const ny = entrance.y + off.y
      if (!isInBounds(nx, ny, mapWidth, mapHeight)) continue
      const tile = map[ny]?.[nx]
      if (tile && isWalkableTile(tile.type)) return { x: nx, y: ny }
    }
  }
  return { x: entrance.x, y: entrance.y }
}
