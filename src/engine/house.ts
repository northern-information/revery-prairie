import { HOUSE_HEIGHT, HOUSE_WIDTH } from './constants'
import { clearAllGrowthPreviews } from './floraGrowthPreviews'
import { recordDiscovery } from './manual'
import { clearMovementTweens } from './movementTween'
import { findSafeExitPosition } from './position'
import { TileType, Zone } from './types'
import { registerZoneSwapHandler, scheduleZoneTransition } from './zoneTransition'

import type { GameState, Position, Tile } from './types'

// Layout constants — middle of the 3-wide pink door.
const HOUSE_EXIT_CENTER_X = 15
const HOUSE_EXIT_Y = 17
const HOUSE_FIREPLACE: Position = { x: 15, y: 0 }
const HOUSE_BED: Position = { x: 28, y: 8 }
const HOUSE_CHAIR: Position = { x: 2, y: 8 }
const HOUSE_SPAWN: Position = { x: 15, y: 16 }

export interface HouseInteriorResult {
  map: Tile[][]
  width: number
  height: number
  exitInterior: Position
  spawnInterior: Position
  bedInterior: Position
  chairInterior: Position
}

/**
 * Build the deterministic 30 x 18 house interior. No RNG — every tile
 * placement is fixed. Perimeter is HouseWall; interior is HouseFloor;
 * fireplace, bed, chair are single furniture tiles; the south wall has
 * a 3-wide HouseExit opening rendered in pink per the cave/ruin idiom.
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

  // 3-wide pink door at south wall center (14, 17), (15, 17), (16, 17).
  for (let dx = -1; dx <= 1; dx++) {
    map[HOUSE_EXIT_Y][HOUSE_EXIT_CENTER_X + dx] = { type: TileType.HouseExit }
  }

  map[HOUSE_FIREPLACE.y][HOUSE_FIREPLACE.x] = { type: TileType.Fireplace }
  map[HOUSE_BED.y][HOUSE_BED.x] = { type: TileType.HouseBed }
  map[HOUSE_CHAIR.y][HOUSE_CHAIR.x] = { type: TileType.HouseChair }

  return {
    map,
    width,
    height,
    exitInterior: { x: HOUSE_EXIT_CENTER_X, y: HOUSE_EXIT_Y },
    spawnInterior: { x: HOUSE_SPAWN.x, y: HOUSE_SPAWN.y },
    bedInterior: { x: HOUSE_BED.x, y: HOUSE_BED.y },
    chairInterior: { x: HOUSE_CHAIR.x, y: HOUSE_CHAIR.y },
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
  // Precis #33 cancel guard: if Emily had armed the invitation, reverting
  // the active dialog without confirm cancels and re-arms 'unoffered'.
  if (state.activeDialog?.characterId === 'emily' && state.emilyInvitation === 'offered') {
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

  state.path = null
  state.pathWaypoints = []
  state.pendingAction = null
  state.pendingInteractionTarget = null
  state.heldDirection = null
  state.previewFn = null
  state.facingEntityPos = null
  // Precis #33 cancel guard: if Emily had armed the invitation, reverting
  // the active dialog without confirm cancels and re-arms 'unoffered'.
  if (state.activeDialog?.characterId === 'emily' && state.emilyInvitation === 'offered') {
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
        if (state.map[py + dy]?.[px + dx]?.type === TileType.HouseEntrance) {
          scheduleZoneTransition(state, performance.now(), {
            direction: 'enter',
            kind: 'house',
            irisCenter: { x: px + dx, y: py + dy },
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
