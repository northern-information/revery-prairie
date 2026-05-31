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

import { CELLAR_ALCOVE_SPACING, CELLAR_INITIAL_HEIGHT, CELLAR_INITIAL_ROOM_COUNT, CELLAR_WIDTH } from './constants'
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
  /** Initial room count. Doubled by extendCellar() as needed. */
  roomCount: number
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
// Build a single row of the corridor at the given y, returning the tiles
// for x ∈ [0, CELLAR_WIDTH). Pure: alcove cuts are stamped over the
// default wall/floor pattern in the caller because the alcove decision
// depends on y AND on which alcove index that y represents.
const corridorRow = (): Tile[] => {
  const row: Tile[] = []
  for (let x = 0; x < CELLAR_WIDTH; x++) {
    const onCorridor = x === 2 || x === 3 || x === 4
    row.push({ type: onCorridor ? TileType.CellarFloor : TileType.CellarWall })
  }
  return row
}

const wallRow = (): Tile[] => {
  const row: Tile[] = []
  for (let x = 0; x < CELLAR_WIDTH; x++) {
    row.push({ type: TileType.CellarWall })
  }
  return row
}

// Carve the alcove tile for room index `i` into the supplied map (which
// must be tall enough). Even index → left wall (x=1); odd → right (x=5).
const carveAlcove = (map: Tile[][], i: number): void => {
  const roomY = 2 + i * CELLAR_ALCOVE_SPACING
  const x = i % 2 === 0 ? 1 : 5
  map[roomY][x] = { type: TileType.CellarAlcoveFloor }
}

export const createKnotCellar = (): KnotCellarBuild => {
  const roomCount = CELLAR_INITIAL_ROOM_COUNT
  const height = CELLAR_INITIAL_HEIGHT
  const map: Tile[][] = []
  for (let y = 0; y < height; y++) {
    map.push(corridorRow())
  }

  // Top row (y=0): back of the bulkhead landing. All walls except the
  // staircase tile at x=3.
  map[0] = wallRow()
  map[0][3] = { type: TileType.CellarBulkheadInterior }

  // Bottom row (y=height-1): full closure wall. Hidden by the fog pass
  // in normal play, but it keeps the corridor finite for movement and
  // pathfinding.
  map[height - 1] = wallRow()

  for (let i = 0; i < roomCount; i++) {
    carveAlcove(map, i)
  }

  return {
    map,
    width: CELLAR_WIDTH,
    height,
    roomCount,
    doorSpawn: { x: 3, y: 1 },
    bulkheadInterior: { x: 3, y: 0 },
  }
}

/**
 * Double the cellar's room count in place. Converts the previous back-
 * wall closure row into a normal corridor row, appends new corridor rows
 * up to the doubled length, carves the new alcoves, and lays a new back-
 * wall row at the bottom. Idempotent for the requested capacity — call
 * `ensureCellarCapacity` rather than this directly.
 */
const extendCellar = (state: GameState): void => {
  const prevCount = state.cellarRoomCount
  const newCount = prevCount * 2
  const newHeight = 2 + newCount * CELLAR_ALCOVE_SPACING
  const map = state.cellarMap

  // The current last row is the back wall. Convert it back into a
  // corridor row, then append new corridor rows up to the new height,
  // and lay a fresh back-wall row at the bottom.
  const oldLast = map.length - 1
  map[oldLast] = corridorRow()
  while (map.length < newHeight - 1) {
    map.push(corridorRow())
  }
  map.push(wallRow())

  // Carve the new alcoves: indices [prevCount, newCount).
  for (let i = prevCount; i < newCount; i++) {
    carveAlcove(map, i)
  }

  state.cellarMapHeight = newHeight
  state.cellarRoomCount = newCount
}

/**
 * Ensure the cellar has at least `requiredRooms` alcoves carved out.
 * Doubles repeatedly from the current room count until the requirement
 * is met. No-op when capacity is already sufficient. Idempotent.
 */
export const ensureCellarCapacity = (state: GameState, requiredRooms: number): void => {
  while (state.cellarRoomCount < requiredRooms) {
    extendCellar(state)
  }
}

/**
 * Position of the alcove at the given index. Pure formula — does not
 * mutate cellar state. Negative or non-integer inputs are floored and
 * clamped to 0. The y-coordinate is unbounded; callers responsible for
 * an index past `state.cellarRoomCount` must call `ensureCellarCapacity`
 * first so the alcove tile actually exists on the map.
 */
export const getAlcovePosition = (index: number): Position => {
  const i = Math.max(0, Math.floor(index))
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
  const i = Math.max(0, Math.floor(index))
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
  // Make sure the cellar is large enough to display every knot the
  // steward has accumulated, including the in-hand bed knot.
  const required = state.archivedKnots.length + (state.bedKnotPresent ? 1 : 0)
  ensureCellarCapacity(state, required)
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
 * Exit the cellar back to the yard. The bulkhead sits in the back yard
 * directly north of the house — one tile south of the bulkhead is the
 * house's north eaves, which the steward cannot stand on. Place the
 * steward one tile **north** of the bulkhead instead, deeper into the
 * back yard away from the house, facing up toward the back fence. The
 * cellar re-entry lock is armed on the yard bulkhead tile so the next
 * move doesn't immediately re-enter.
 */
export const exitKnotCellarToYard = (state: GameState): void => {
  // RP-69 — yard now lives in state.thresholdZones (the singleton
  // yardMap fields were retired by the registry migration).
  const yardEntry = state.thresholdZones.get('littleHouseYard')
  if (!yardEntry || yardEntry.map.length === 0) {
    console.warn('exitKnotCellarToYard called with no yard registered; skipping')
    return
  }
  const returnTile: Position = {
    x: state.cellarBulkheadYard.x,
    y: state.cellarBulkheadYard.y - 1,
  }
  state.map = yardEntry.map
  state.mapWidth = yardEntry.width
  state.mapHeight = yardEntry.height
  state.currentZone = Zone.LittleHouseYard
  state.player = returnTile
  state.playerFacing = 'up'
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
