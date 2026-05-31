import { HOUSE_HEIGHT, HOUSE_WIDTH } from './constants'
import { clearAllGrowthPreviews } from './floraGrowthPreviews'
import { recordDiscovery } from './manual'
import { clearMovementTweens } from './movementTween'
import { findSafeExitPosition } from './position'
import { TileType, Zone } from './types'
import { armReentryLock, isReentryLocked, registerZoneSwapHandler, scheduleZoneTransition } from './zoneTransition'

import type { GameState, Position, Tile } from './types'

// Layout constants — middle of the 3-wide pink door.
// Layout constants for the 15x9 little house interior.
// Walls form an unbroken perimeter. The fireplace stands in front of the
// north wall (row 1) with a hearth row directly south of it (row 2).
// The south wall is broken by a 3-wide pink-door exit centered on x=7.
const HOUSE_FIREPLACE_CENTER_X = 7
const HOUSE_FIREPLACE_Y = 1
const HOUSE_HEARTH_Y = 2
const HOUSE_EXIT_CENTER_X = 7
const HOUSE_EXIT_Y = 8
// Player tenure-start spawn — opposite Emily across the room's vertical
// centerline (Emily at x=5, mirrored to x=9), same hearth row. Faces
// west toward Emily so the first frame frames the two of them by the
// fire. v11 R7 amendment (RP-36): this is also the Revery anchor —
// the steward Reveries in place here, no bed teleport.
const HOUSE_SPAWN: Position = { x: 9, y: 2 }

export interface HouseInteriorResult {
  map: Tile[][]
  width: number
  height: number
  exitInterior: Position
  spawnInterior: Position
}

/**
 * Build the deterministic 15 x 9 house interior. No RNG — every tile
 * placement is fixed. Perimeter is HouseWall (unbroken on the north
 * side). The fireplace stands in front of the north wall as a 3-tile
 * piece of furniture (row 1) with a 3-tile hearth in front of it
 * (row 2). The south wall has a 3-wide HouseExit opening rendered in
 * pink per the cave/ruin idiom.
 */
export const createHouseInterior = (): HouseInteriorResult => {
  const width = HOUSE_WIDTH
  const height = HOUSE_HEIGHT
  const map: Tile[][] = []
  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < width; x++) {
      const onPerimeter = x === 0 || y === 0 || x === width - 1 || y === height - 1
      row.push({ type: onPerimeter ? TileType.HouseWall : TileType.HouseFloor })
    }
    map.push(row)
  }

  // 3-wide pink door at the south wall, centered.
  for (let dx = -1; dx <= 1; dx++) {
    map[HOUSE_EXIT_Y][HOUSE_EXIT_CENTER_X + dx] = { type: TileType.HouseExit }
  }

  // 3-wide fireplace standing in front of the (intact) north wall, with
  // a matching 3-wide hearth directly south of it.
  for (let dx = -1; dx <= 1; dx++) {
    map[HOUSE_FIREPLACE_Y][HOUSE_FIREPLACE_CENTER_X + dx] = { type: TileType.Fireplace }
    map[HOUSE_HEARTH_Y][HOUSE_FIREPLACE_CENTER_X + dx] = { type: TileType.HouseHearth }
  }

  return {
    map,
    width,
    height,
    exitInterior: { x: HOUSE_EXIT_CENTER_X, y: HOUSE_EXIT_Y },
    spawnInterior: { x: HOUSE_SPAWN.x, y: HOUSE_SPAWN.y },
  }
}

// --- Transition handlers ---
// Mirror cave.ts:189-253. Both zones persist simultaneously via
// state.houseMap / state.overworldMap pointer pairs.

export const enterHouse = (state: GameState): void => {
  if (!state.houseMap || state.houseMap.length === 0) {
    console.warn('enterHouse called with no houseMap; skipping')
    return
  }
  state.map = state.houseMap
  state.mapWidth = state.houseMapWidth
  state.mapHeight = state.houseMapHeight
  state.player = { x: state.houseEntranceInterior.x, y: state.houseEntranceInterior.y }
  state.currentZone = Zone.HouseInterior
  recordDiscovery(state, 'zone:house')

  state.path = null
  state.pathWaypoints = []
  state.pendingAction = null
  state.pendingInteractionTarget = null
  state.heldDirection = null
  state.previewFn = null
  state.facingEntityPos = null
  // RP-33 cancel guard: if Emily had armed the invitation, reverting
  // the active dialog without confirm cancels and re-arms 'unoffered'.
  if (
    state.activeDialog?.speakerKind === 'character' &&
    state.activeDialog.characterId === 'emily' &&
    state.emilyInvitation === 'offered'
  ) {
    state.emilyInvitation = 'unoffered'
  }
  state.activeDialog = null
  state.trail = []
  clearAllGrowthPreviews(state)
  clearMovementTweens(state)
}

export const exitHouse = (state: GameState): void => {
  state.map = state.overworldMap
  state.mapWidth = state.overworldMapWidth
  state.mapHeight = state.overworldMapHeight
  state.currentZone = Zone.Overworld
  state.player = findSafeExitPosition(state.houseEntranceOverworld, state.map, state.mapWidth, state.mapHeight, 2)

  // Arm the re-entry lock on the house door the player just left.
  armReentryLock(state, state.houseEntranceOverworld)

  state.path = null
  state.pathWaypoints = []
  state.pendingAction = null
  state.pendingInteractionTarget = null
  state.heldDirection = null
  state.previewFn = null
  state.facingEntityPos = null
  // RP-33 cancel guard: if Emily had armed the invitation, reverting
  // the active dialog without confirm cancels and re-arms 'unoffered'.
  if (
    state.activeDialog?.speakerKind === 'character' &&
    state.activeDialog.characterId === 'emily' &&
    state.emilyInvitation === 'offered'
  ) {
    state.emilyInvitation = 'unoffered'
  }
  state.activeDialog = null
  state.trail = []
  clearAllGrowthPreviews(state)
  clearMovementTweens(state)
}

/**
 * Detect overworld-3x3-hitbox-on-HouseEntrance or interior-on-HouseExit
 * and schedule the appropriate zone transition. Called from
 * cave.ts:checkTransition after the cave + ruin checks.
 */
export const checkHouseTransition = (state: GameState): boolean => {
  const px = state.player.x
  const py = state.player.y

  if (state.currentZone === Zone.Overworld) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ex = px + dx
        const ey = py + dy
        if (state.map[ey]?.[ex]?.type === TileType.HouseEntrance) {
          // Suppress re-entry into the house the player just exited.
          if (isReentryLocked(state, { x: ex, y: ey })) continue
          scheduleZoneTransition(state, performance.now(), {
            direction: 'enter',
            kind: 'house',
            irisCenter: { x: ex, y: ey },
          })
          return true
        }
      }
    }
  }

  if (state.currentZone === Zone.HouseInterior) {
    if (state.map[py]?.[px]?.type === TileType.HouseExit) {
      scheduleZoneTransition(state, performance.now(), {
        direction: 'exit',
        kind: 'house',
        irisCenter: { x: px, y: py },
      })
      return true
    }
  }

  return false
}

// Register house swap handlers — module-load side effect, mirrors
// cave.ts:294-299.
registerZoneSwapHandler('house', 'enter', state => {
  enterHouse(state)
})
registerZoneSwapHandler('house', 'exit', state => {
  exitHouse(state)
})
