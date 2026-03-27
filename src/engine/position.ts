import { TileType } from './types'

import type { Direction, Position } from './types'

export const posKey = (x: number, y: number): string => `${String(x)},${String(y)}`

export const isInBounds = (x: number, y: number, w: number, h: number): boolean => x >= 0 && x < w && y >= 0 && y < h

export const removeByIndices = (arr: unknown[], indices: number[]): void => {
  for (let i = indices.length - 1; i >= 0; i--) {
    const idx = indices[i]
    if (idx !== undefined) arr.splice(idx, 1)
  }
}

// 4-directional movement deltas, keyed by direction name (for WASD)
export const DIRECTIONS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
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

export const isWalkableTile = (tileType: TileType): boolean =>
  tileType !== TileType.Space &&
  tileType !== TileType.CaveWall &&
  tileType !== TileType.CaveBreakableWall
