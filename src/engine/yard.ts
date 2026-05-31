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
import { clearAllGrowthPreviews } from './floraGrowthPreviews'
import { recordDiscovery } from './manual'
import { clearMovementTweens } from './movementTween'
import { findSafeExitPosition, posKey } from './position'
import { FloraSpecies, TileType, Zone } from './types'
import { armReentryLock, registerZoneSwapHandler } from './zoneTransition'

import type { GameState, Position, Tile } from './types'

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

  // South gate — 3-wide pink-block opening centered on the bottom
  // fence edge, mirroring the cave/ruin/house exit idiom.
  for (let dx = -1; dx <= 1; dx++) {
    map[YARD_GATE_Y][YARD_GATE_X + dx] = { type: TileType.FenceGate }
  }

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

// --- Flora sampling ---
//
// At every yard-enter event the yard's flora is cleared and re-sampled
// from the prairie's species composition on the 8 HouseApron tiles
// surrounding state.houseEntranceOverworld. The result is a
// proportional scatter — _a yard ringed by wildflowers reads as a
// wildflower yard_. The samples are cosmetic: no growth, no decay, no
// weather response; they live entirely on state.yardFlora and the
// yard map's TileType.Flora tiles.

const APRON_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const

// Alphabetical species order for deterministic scatter assignment.
// Matches Object.values(FloraSpecies) sorted ascending, hand-rolled so
// the rule is visible in code.
const SPECIES_ORDER: readonly FloraSpecies[] = [
  FloraSpecies.Clover,
  FloraSpecies.TallGrass,
  FloraSpecies.Wildflower,
] as const

const tallyApronFlora = (state: GameState): Record<FloraSpecies, number> => {
  const tally: Record<FloraSpecies, number> = {
    [FloraSpecies.Clover]: 0,
    [FloraSpecies.TallGrass]: 0,
    [FloraSpecies.Wildflower]: 0,
  }
  const center = state.houseEntranceOverworld
  for (const [dx, dy] of APRON_OFFSETS) {
    const x = center.x + dx
    const y = center.y + dy
    const lifecycle = state.floraLifecycle.get(posKey(x, y))
    if (lifecycle) {
      tally[lifecycle.species] += 1
    }
  }
  return tally
}

const collectWalkableYardInterior = (state: GameState): Position[] => {
  // Yard-interior tiles that are currently Dirt (i.e. plain walkable
  // ground, not yet flora-overlaid). Sorted by (y, x) ascending so the
  // scatter order is deterministic and stable across re-entries.
  const positions: Position[] = []
  for (let y = 0; y < state.yardMapHeight; y++) {
    for (let x = 0; x < state.yardMapWidth; x++) {
      if (state.yardMap[y][x].type === TileType.Dirt) {
        positions.push({ x, y })
      }
    }
  }
  return positions
}

export const sampleYardFlora = (state: GameState): void => {
  // Clear stale samples — restore previously flora-overlaid tiles to
  // Dirt before scattering the new tally.
  for (const key of state.yardFlora.keys()) {
    const [xs, ys] = key.split(',')
    const x = Number(xs)
    const y = Number(ys)
    if (state.yardMap[y]?.[x]?.type === TileType.Flora) {
      state.yardMap[y][x] = { type: TileType.Dirt }
    }
  }
  state.yardFlora.clear()

  const tally = tallyApronFlora(state)
  // Short-circuit if the apron is barren — _a barren apron reads as a
  // barren yard_.
  const total = SPECIES_ORDER.reduce((sum, s) => sum + tally[s], 0)
  if (total === 0) return

  const walkable = collectWalkableYardInterior(state)
  if (walkable.length === 0) return

  // Walk the sorted walkable list, assigning each species N consecutive
  // slots. If the apron tally exceeds the walkable count (unlikely —
  // 8 apron tiles, ~520 walkable interior cells), later species in
  // alphabetical order simply receive fewer placements.
  let cursor = 0
  for (const species of SPECIES_ORDER) {
    const want = tally[species]
    for (let i = 0; i < want && cursor < walkable.length; i++, cursor++) {
      const { x, y } = walkable[cursor]
      state.yardMap[y][x] = { type: TileType.Flora }
      state.yardFlora.set(posKey(x, y), species)
    }
    if (cursor >= walkable.length) break
  }
}

// --- Transition handlers ---
// Mirror house.ts:90-122. The yard zone shares the overworld + house
// pointer-pair pattern: state.yardMap persists for the tenure and is
// swapped into state.map on enter / restored on exit.

const clearYardUiState = (state: GameState): void => {
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
 * Enter the yard from the overworld apron. Player lands at the gate;
 * the apron tile that triggered the transition is stashed on
 * state.yardEntryApron so the gate exit can return there.
 */
export const enterLittleHouseYardFromApron = (state: GameState, apron: Position): void => {
  if (!state.yardMap || state.yardMap.length === 0) {
    console.warn('enterLittleHouseYardFromApron called with no yardMap; skipping')
    return
  }
  state.map = state.yardMap
  state.mapWidth = state.yardMapWidth
  state.mapHeight = state.yardMapHeight
  state.player = { x: state.yardGatePosition.x, y: state.yardGatePosition.y }
  state.currentZone = Zone.LittleHouseYard
  state.yardEntryApron = { x: apron.x, y: apron.y }
  sampleYardFlora(state)
  recordDiscovery(state, 'zone:yard')
  clearYardUiState(state)
}

/**
 * Enter the yard from the house interior. Player exits through the
 * front door and lands one tile south of yardFrontDoorPosition — on
 * the walkable yard ground immediately in front of the door.
 * yardEntryApron is left untouched (the gate exit consumes it; an exit
 * via the house door is not paired with an overworld apron return).
 */
export const enterLittleHouseYardFromHouse = (state: GameState): void => {
  if (!state.yardMap || state.yardMap.length === 0) {
    console.warn('enterLittleHouseYardFromHouse called with no yardMap; skipping')
    return
  }
  state.map = state.yardMap
  state.mapWidth = state.yardMapWidth
  state.mapHeight = state.yardMapHeight
  state.player = {
    x: state.yardFrontDoorPosition.x,
    y: state.yardFrontDoorPosition.y + 1,
  }
  state.currentZone = Zone.LittleHouseYard
  sampleYardFlora(state)
  recordDiscovery(state, 'zone:yard')
  clearYardUiState(state)
}

/**
 * Exit the yard via the gate. Player returns to the overworld at
 * state.yardEntryApron; if null (defensive — e.g. saves predating
 * RP-67, or a player who entered the yard via the house door and
 * walked to the gate without ever touching the apron), the player is
 * placed at a safe tile near houseEntranceOverworld.
 *
 * The re-entry lock is armed on the apron tile so the next overworld
 * step doesn't immediately re-enter the yard. The lock clears when the
 * player walks STRUCTURE_REENTRY_REARM_DISTANCE tiles away (handled by
 * clearReentryLockIfRearmed in the existing overworld tick path).
 */
export const exitLittleHouseYardToOverworld = (state: GameState): void => {
  const returnTile =
    state.yardEntryApron ??
    findSafeExitPosition(state.houseEntranceOverworld, state.overworldMap, state.overworldMapWidth, state.overworldMapHeight, 2)
  state.map = state.overworldMap
  state.mapWidth = state.overworldMapWidth
  state.mapHeight = state.overworldMapHeight
  state.currentZone = Zone.Overworld
  state.player = { x: returnTile.x, y: returnTile.y }
  armReentryLock(state, returnTile)
  state.yardEntryApron = null
  clearYardUiState(state)
}

// Register yard swap handlers — module-load side effect, mirrors
// house.ts:200-205.
registerZoneSwapHandler('yard', 'enter', (state, transition) => {
  // irisCenter for the apron→yard path is the apron tile the player
  // walked onto. We pass that through as state.yardEntryApron.
  enterLittleHouseYardFromApron(state, transition.irisCenter)
})
registerZoneSwapHandler('yard', 'exit', state => {
  exitLittleHouseYardToOverworld(state)
})
registerZoneSwapHandler('house-to-yard', 'exit', state => {
  enterLittleHouseYardFromHouse(state)
})
