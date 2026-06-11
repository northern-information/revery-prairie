import { getElevationTier } from './tileBg'
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

// RP-49 — Adjacent-tile cube step the steward can climb. The renderer
// in tileBg.ts discretizes elevation into ELEVATION_TIER_COUNT tiers
// (each tier = one visible cube); the gameplay gate uses the same
// quantization. The steward may step between tiles whose tier values
// differ by at most one — flat steps and one-cube transitions are
// allowed; two-cube cliffs are not. Reads only from the elevation map
// via getElevationTier; tile types and entities are gated separately
// by isWalkableTile and the entity-block check.
// RP-64 — frozen-stairway override key shape: `${fromKey}->${toKey}`.
// The set carries one entry per (winter, frozen) waterfall, keyed
// on the bottom→top transition only — descending the cascade is
// never made climbable per the v11 R5 asymmetric lock.
export const frozenStairwayKey = (fromX: number, fromY: number, toX: number, toY: number): string =>
  `${posKey(fromX, fromY)}->${posKey(toX, toY)}`

export const isClimbableStep = (
  elevation: Map<string, number>,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  frozenStairways?: Set<string>
): boolean => {
  const fromElev = elevation.get(posKey(fromX, fromY))
  const toElev = elevation.get(posKey(toX, toY))
  // Cave and ungenerated zones have no elevation entries; treat every
  // step there as climbable so non-overworld movement is unaffected.
  if (fromElev === undefined || toElev === undefined) return true
  if (Math.abs(getElevationTier(toElev) - getElevationTier(fromElev)) <= 1) return true
  // RP-64 — frozen-waterfall stairway override. Only the upward
  // (bottom→top) direction qualifies; the reverse remains blocked.
  // _Walking off the top is allowed; climbing up from the bottom
  // requires a foothold — the frozen ice provides one._
  if (frozenStairways?.has(frozenStairwayKey(fromX, fromY, toX, toY))) return true
  return false
}

export const isWalkableTile = (tileType: TileType): boolean =>
  tileType !== TileType.Space &&
  tileType !== TileType.CaveWall &&
  tileType !== TileType.CaveBreakableWall &&
  tileType !== TileType.RuinWall &&
  tileType !== TileType.RuinDebris &&
  tileType !== TileType.RuinDoorLocked &&
  // RP-33 — house walls and the fireplace are not walkable.
  // HouseHearth is walkable — the player can approach the fireplace
  // by standing on the hearth. (Bed and chair dropped in v11 R7.)
  tileType !== TileType.HouseWall &&
  tileType !== TileType.Fireplace &&
  // RP-67 — yard exterior tiles. The roof, eaves, and fence block
  // movement. HouseDoorClosed (the front door from outside) and
  // FenceGate (the south gate) are walkable; stepping on them triggers
  // their respective zone transitions. RP-69a — BrokenFence is the
  // weathered yard fence variant and is intentionally walkable (omitted
  // from the exclude list above), so the steward can cross a collapsed
  // segment without using the gate.
  tileType !== TileType.HouseRoof &&
  tileType !== TileType.HouseEaves &&
  tileType !== TileType.Fence &&
  // RP-37 — Knot Cellar walls. CellarFloor, CellarAlcoveFloor,
  // CellarBulkhead, and CellarBulkheadInterior are walkable (the
  // bulkhead pair triggers zone transitions on step).
  tileType !== TileType.CellarWall

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
