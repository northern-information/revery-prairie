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

export const isWalkableTile = (tileType: TileType): boolean =>
  tileType !== TileType.Space &&
  tileType !== TileType.CaveWall &&
  tileType !== TileType.CaveBreakableWall &&
  tileType !== TileType.RuinWall &&
  tileType !== TileType.RuinDebris &&
  tileType !== TileType.RuinDoorLocked

/** Find the nearest walkable tile adjacent to an entrance for safe exit placement.
 *  Checks south first (preferred), then remaining cardinals, then diagonals.
 *  Falls back to the entrance position itself if nothing is walkable. */
export const findSafeExitPosition = (
  entrance: Position,
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
): Position => {
  // Priority order: south first (original behavior), then other cardinals, then diagonals
  const offsets: Position[] = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
  ]
  for (const off of offsets) {
    const nx = entrance.x + off.x
    const ny = entrance.y + off.y
    if (!isInBounds(nx, ny, mapWidth, mapHeight)) continue
    const tile = map[ny]?.[nx]
    if (tile && isWalkableTile(tile.type)) {
      return { x: nx, y: ny }
    }
  }
  // Fallback: entrance itself
  return { x: entrance.x, y: entrance.y }
}
