// RP-67 — the yard around the little house.
//
// This module owns the LittleHouseYard zone: map construction at genesis,
// enter/exit handlers wired to zoneTransition.ts, flora sampling at zone
// enter, and the yard's contribution to the pause-player-time table.
//
// Spec: harness/specs/RP-67-little-house-yard.yaml
// Plan: harness/plans/RP-67-little-house-yard.yaml
//
// Subsequent tasks add the transition handlers, flora sampling, and the
// clock/camera/visibility hooks.

import {
  HOUSE_HEIGHT,
  HOUSE_WIDTH,
  YARD_FRONT_DOOR_X,
  YARD_FRONT_DOOR_Y,
  YARD_GATE_X,
  YARD_GATE_Y,
  YARD_HEIGHT,
  YARD_HOUSE_OFFSET_X,
  YARD_HOUSE_OFFSET_Y,
  YARD_WIDTH,
} from './constants'
import { TileType } from './types'

import type { Position, Tile } from './types'

export interface LittleHouseYardResult {
  map: Tile[][]
  width: number
  height: number
  gatePosition: Position
  frontDoorPosition: Position
}

/**
 * Build the deterministic 23 × 32 little-house yard map. No RNG — every
 * tile placement is fixed. Layout (v11 R8 lock):
 *
 *   - perimeter ring is Fence, with a single FenceGate at the south
 *     edge center
 *   - the house roof + eaves occupy a 15 × 9 footprint flush against
 *     the back fence (3-tile back margin + 3-tile side margins)
 *   - HouseEaves sits on the roof rectangle's perimeter cells
 *   - HouseRoof fills the inner 13 × 7 cells
 *   - three HouseDoorClosed tiles replace the southern-most eaves cells
 *     (mirrors the 3-wide pink door inside the house interior)
 *   - everything else is Dirt — walkable yard ground, layered with
 *     flora at zone-enter time by a later task
 */
export const createLittleHouseYard = (): LittleHouseYardResult => {
  const width = YARD_WIDTH
  const height = YARD_HEIGHT
  const map: Tile[][] = []
  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < width; x++) {
      const onFence = x === 0 || y === 0 || x === width - 1 || y === height - 1
      row.push({ type: onFence ? TileType.Fence : TileType.Dirt })
    }
    map.push(row)
  }

  // South gate, single tile centered on the bottom fence edge.
  map[YARD_GATE_Y][YARD_GATE_X] = { type: TileType.FenceGate }

  // House roof + eaves footprint. Eaves on the rectangle's perimeter,
  // roof on the inner cells.
  const houseEastX = YARD_HOUSE_OFFSET_X + HOUSE_WIDTH - 1
  const houseSouthY = YARD_HOUSE_OFFSET_Y + HOUSE_HEIGHT - 1
  for (let y = YARD_HOUSE_OFFSET_Y; y <= houseSouthY; y++) {
    for (let x = YARD_HOUSE_OFFSET_X; x <= houseEastX; x++) {
      const onEaves = x === YARD_HOUSE_OFFSET_X || x === houseEastX || y === YARD_HOUSE_OFFSET_Y || y === houseSouthY
      map[y][x] = { type: onEaves ? TileType.HouseEaves : TileType.HouseRoof }
    }
  }

  // 3-wide HouseDoorClosed centered on the south face of the house,
  // overwriting the eaves cells that would otherwise sit there. Mirrors
  // the 3-wide HouseExit inside the house interior.
  for (let dx = -1; dx <= 1; dx++) {
    map[YARD_FRONT_DOOR_Y][YARD_FRONT_DOOR_X + dx] = { type: TileType.HouseDoorClosed }
  }

  return {
    map,
    width,
    height,
    gatePosition: { x: YARD_GATE_X, y: YARD_GATE_Y },
    frontDoorPosition: { x: YARD_FRONT_DOOR_X, y: YARD_FRONT_DOOR_Y },
  }
}
