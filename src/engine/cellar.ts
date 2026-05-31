// RP-37 — the Knot Cellar.
//
// A long narrow corridor archive accessed via a bulkhead in the back yard.
// Alcoves are cut into the side walls at every CELLAR_ALCOVE_SPACING
// rows, alternating left/right by alcove index parity. The first alcove
// (index 0) sits closest to the door on the left; the second (index 1)
// deeper on the right; etc. No two alcoves share a y-coordinate, so a
// steward in the corridor never sees two knots framing them.
//
// This module owns:
//   * createKnotCellar() — deterministic map construction at genesis
//   * getAlcovePosition(index) / getAlcoveFacing(index) — pure helpers
//     consumed by render passes and the post-Revery awaken hook
//   * enterKnotCellar / exitKnotCellar zone-swap handlers

import { CELLAR_ALCOVE_SPACING, CELLAR_HEIGHT, CELLAR_ROOM_CAP, CELLAR_WIDTH } from './constants'
import { clearAllGrowthPreviews } from './floraGrowthPreviews'
import { recordDiscovery } from './manual'
import { clearMovementTweens } from './movementTween'
import { TileType, Zone } from './types'
import { armReentryLock, registerZoneSwapHandler } from './zoneTransition'

import type { GameState, Position, Tile } from './types'

export interface KnotCellarBuild {
  map: Tile[][]
  width: number
  height: number
  /** Where the steward lands on bulkhead entry — cellar floor immediately south of the staircase. */
  doorSpawn: Position
  /** The in-cellar staircase tile that exits back to the yard. */
  bulkheadInterior: Position
}

/**
 * Build the Knot Cellar map deterministically (no RNG).
 *
 * Layout (columns):
 *   x=0          CellarWall    (left back-of-alcove)
 *   x=1          CellarWall by default; CellarAlcoveFloor at left-alcove rows
 *   x=2,3,4      CellarFloor  (the 3-wide central corridor)
 *   x=5          CellarWall by default; CellarAlcoveFloor at right-alcove rows
 *   x=6          CellarWall    (right back-of-alcove)
 *
 * Rows:
 *   y=0          CellarWall across all x EXCEPT CellarBulkheadInterior at (3, 0)
 *   y=1          The cellar door row — CellarFloor at x=2,3,4; walls elsewhere
 *   y=2 + i*S    Alcove row for index i — CellarAlcoveFloor at x=1 (left) or
 *                x=5 (right) per (i % 2 === 0); the rest of the row is the
 *                normal corridor / wall pattern
 *   y=last       CellarWall across all x (closure; hidden by the fog pass)
 */
export const createKnotCellar = (): KnotCellarBuild => {
  const width = CELLAR_WIDTH
  const height = CELLAR_HEIGHT
  const map: Tile[][] = []
  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < width; x++) {
      // Default classification by column.
      let type: TileType
      if (x === 2 || x === 3 || x === 4) {
        type = TileType.CellarFloor
      } else {
        type = TileType.CellarWall
      }
      row.push({ type })
    }
    map.push(row)
  }

  // Top row (y=0): back of the bulkhead landing. All walls except the
  // staircase tile at x=3.
  for (let x = 0; x < width; x++) {
    map[0][x] = { type: TileType.CellarWall }
  }
  map[0][3] = { type: TileType.CellarBulkheadInterior }

  // Bottom row (y=height-1): full closure wall. Hidden by the fog pass
  // in normal play, but it keeps the corridor finite for movement and
  // pathfinding.
  for (let x = 0; x < width; x++) {
    map[height - 1][x] = { type: TileType.CellarWall }
  }

  // Alcoves: one per index in [0, CELLAR_ROOM_CAP), staggered by spacing
  // and alternated left/right by parity.
  for (let i = 0; i < CELLAR_ROOM_CAP; i++) {
    const roomY = 2 + i * CELLAR_ALCOVE_SPACING
    if (roomY >= height - 1) break
    const left = i % 2 === 0
    const x = left ? 1 : 5
    map[roomY][x] = { type: TileType.CellarAlcoveFloor }
  }

  return {
    map,
    width,
    height,
    doorSpawn: { x: 3, y: 1 },
    bulkheadInterior: { x: 3, y: 0 },
  }
}

/**
 * Position of the alcove at the given index. Pure; index is clamped into
 * [0, CELLAR_ROOM_CAP - 1] defensively. Even indices are left-side
 * alcoves (x=1); odd indices are right-side (x=5).
 */
export const getAlcovePosition = (index: number): Position => {
  const i = Math.max(0, Math.min(CELLAR_ROOM_CAP - 1, Math.floor(index)))
  return {
    x: i % 2 === 0 ? 1 : 5,
    y: 2 + i * CELLAR_ALCOVE_SPACING,
  }
}

/**
 * Direction the steward should face when spawned in alcove `index`:
 * looking out of the alcove toward the corridor centerline.
 * - Left-side alcove (even index) → face right
 * - Right-side alcove (odd index) → face left
 */
export const getAlcoveFacing = (index: number): 'left' | 'right' => {
  const i = Math.max(0, Math.min(CELLAR_ROOM_CAP - 1, Math.floor(index)))
  return i % 2 === 0 ? 'right' : 'left'
}

// --- Transition handlers ---
//
// Mirror yard.ts and house.ts: state.cellarMap persists for the tenure
// and is swapped into state.map on enter / restored to yardMap on exit.

const clearCellarUiState = (state: GameState): void => {
  state.path = null
  state.pathWaypoints = []
  state.pendingAction = null
  state.pendingInteractionTarget = null
  state.heldDirection = null
  state.previewFn = null
  state.facingEntityPos = null
  state.activeDialog = null
  state.trail = []
  clearAllGrowthPreviews(state)
  clearMovementTweens(state)
}

/**
 * Enter the Knot Cellar from the yard bulkhead. Player lands at the
 * cellar door — one tile south of the staircase — facing down the
 * corridor.
 */
export const enterKnotCellar = (state: GameState): void => {
  if (!state.cellarMap || state.cellarMap.length === 0) {
    console.warn('enterKnotCellar called with no cellarMap; skipping')
    return
  }
  state.map = state.cellarMap
  state.mapWidth = state.cellarMapWidth
  state.mapHeight = state.cellarMapHeight
  state.player = { x: state.cellarDoorSpawn.x, y: state.cellarDoorSpawn.y }
  state.playerFacing = 'down'
  state.currentZone = Zone.KnotCellar
  recordDiscovery(state, 'zone:knotCellar')
  clearCellarUiState(state)
}

/**
 * Exit the cellar back to the yard. Player lands one tile south of the
 * yard-side bulkhead (in the back yard, facing south away from the
 * hatch). The cellar re-entry lock is armed on the yard bulkhead tile
 * so the next move doesn't immediately re-enter.
 */
export const exitKnotCellarToYard = (state: GameState): void => {
  if (!state.yardMap || state.yardMap.length === 0) {
    console.warn('exitKnotCellarToYard called with no yardMap; skipping')
    return
  }
  const returnTile: Position = {
    x: state.cellarBulkheadYard.x,
    y: state.cellarBulkheadYard.y + 1,
  }
  state.map = state.yardMap
  state.mapWidth = state.yardMapWidth
  state.mapHeight = state.yardMapHeight
  state.currentZone = Zone.LittleHouseYard
  state.player = returnTile
  state.playerFacing = 'down'
  armReentryLock(state, state.cellarBulkheadYard)
  clearCellarUiState(state)
}

// Register cellar swap handlers — module-load side effect, mirrors
// yard.ts:295-307 and house.ts:220-227.
registerZoneSwapHandler('knot-cellar', 'enter', state => {
  enterKnotCellar(state)
})
registerZoneSwapHandler('knot-cellar', 'exit', state => {
  exitKnotCellarToYard(state)
})
