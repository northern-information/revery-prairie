// RP-67 — the yard around the little house.
// RP-69 — migrated to the threshold-zone registry (state.thresholdZones).
//
// This module owns the LittleHouseYard zone: map construction at genesis,
// registration into the threshold-zone registry, enter/exit handlers
// wired to zoneTransition.ts, flora sampling at zone enter, and the
// yard's contribution to the pause-player-time table.
//
// Spec: harness/specs/RP-67-little-house-yard.yaml (original)
// Spec: harness/specs/RP-69-whine-haunted-village.yaml (registry move)

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

import type { GameState, GateBinding, Position, ThresholdZoneState, Tile } from './types'

// RP-69 — registry key for the little house yard. Stable across saves.
export const LITTLE_HOUSE_YARD_ID = 'littleHouseYard'

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
 *     flora at zone-enter time by sampleYardFlora
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

/**
 * Build a ThresholdZoneState for the little house yard and register it
 * into state.thresholdZones at id `LITTLE_HOUSE_YARD_ID`. Called once
 * at genesis by createGameState. The gatePositions Map records only
 * the south FenceGate (3-tile wide gate row) as 'exit' bindings — the
 * HouseDoorClosed transition into the house interior is still detected
 * by tile type in house.ts (no binding required for the single-yard
 * case).
 */
export const registerLittleHouseYard = (state: GameState, yard: LittleHouseYardResult): void => {
  const gatePositions = new Map<string, GateBinding>()
  // The gate row is three FenceGate tiles wide; any of them exits to
  // the overworld. Bind each so movement.ts's gatePositions lookup
  // (planned in RP-69 Task 4) sees a consistent binding for the row.
  for (let dx = -1; dx <= 1; dx++) {
    gatePositions.set(posKey(yard.gatePosition.x + dx, yard.gatePosition.y), {
      kind: 'exit',
      targetIsOverworld: true,
    })
  }

  const entry: ThresholdZoneState = {
    id: LITTLE_HOUSE_YARD_ID,
    zoneVariant: Zone.LittleHouseYard,
    map: yard.map,
    width: yard.width,
    height: yard.height,
    gatePositions,
    entryReturnTile: null,
    pausesPlayerTime: true,
    frontDoorPosition: { x: yard.frontDoorPosition.x, y: yard.frontDoorPosition.y },
    flora: new Map(),
  }
  state.thresholdZones.set(LITTLE_HOUSE_YARD_ID, entry)
}

/**
 * Fetch the little house yard's registry entry. Throws if missing —
 * callers should only invoke this when the yard is expected to exist
 * (post-genesis). Defensive handlers use `state.thresholdZones.get` so
 * they can no-op instead of throwing.
 */
export const getLittleHouseYard = (state: GameState): ThresholdZoneState => {
  const entry = state.thresholdZones.get(LITTLE_HOUSE_YARD_ID)
  if (!entry) {
    throw new Error('little house yard not registered in state.thresholdZones')
  }
  return entry
}

// --- Flora sampling ---
//
// At every yard-enter event the yard's flora is cleared and re-sampled
// from the prairie's species composition on the 8 HouseApron tiles
// surrounding state.houseEntranceOverworld. The result is a
// proportional scatter — _a yard ringed by wildflowers reads as a
// wildflower yard_. The samples are cosmetic: no growth, no decay, no
// weather response; they live entirely on the registry entry's `flora`
// field and the yard map's TileType.Flora tiles.

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

const collectWalkableYardInterior = (entry: ThresholdZoneState): Position[] => {
  // Yard-interior tiles that are currently Dirt (i.e. plain walkable
  // ground, not yet flora-overlaid). Sorted by (y, x) ascending so the
  // scatter order is deterministic and stable across re-entries.
  const positions: Position[] = []
  for (let y = 0; y < entry.height; y++) {
    for (let x = 0; x < entry.width; x++) {
      if (entry.map[y][x].type === TileType.Dirt) {
        positions.push({ x, y })
      }
    }
  }
  return positions
}

export const sampleYardFlora = (state: GameState): void => {
  const entry = state.thresholdZones.get(LITTLE_HOUSE_YARD_ID)
  if (!entry || !entry.flora) return

  // Clear stale samples — restore previously flora-overlaid tiles to
  // Dirt before scattering the new tally.
  for (const key of entry.flora.keys()) {
    const [xs, ys] = key.split(',')
    const x = Number(xs)
    const y = Number(ys)
    if (entry.map[y]?.[x]?.type === TileType.Flora) {
      entry.map[y][x] = { type: TileType.Dirt }
    }
  }
  entry.flora.clear()

  const tally = tallyApronFlora(state)
  // Short-circuit if the apron is barren — _a barren apron reads as a
  // barren yard_.
  const total = SPECIES_ORDER.reduce((sum, s) => sum + tally[s], 0)
  if (total === 0) return

  const walkable = collectWalkableYardInterior(entry)
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
      entry.map[y][x] = { type: TileType.Flora }
      entry.flora.set(posKey(x, y), species)
    }
    if (cursor >= walkable.length) break
  }
}

// --- Transition handlers ---
// Mirror house.ts:90-122. The yard zone shares the overworld + house
// pointer-pair pattern: the yard map persists for the tenure (held in
// the registry entry) and is swapped into state.map on enter / restored
// on exit.

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
 * the apron tile that triggered the transition is stashed on the
 * registry entry's entryReturnTile so the gate exit can return there.
 */
export const enterLittleHouseYardFromApron = (state: GameState, apron: Position): void => {
  const entry = state.thresholdZones.get(LITTLE_HOUSE_YARD_ID)
  if (!entry || entry.map.length === 0) {
    console.warn('enterLittleHouseYardFromApron called with no yard registered; skipping')
    return
  }
  state.map = entry.map
  state.mapWidth = entry.width
  state.mapHeight = entry.height
  // Center the player on the middle gate tile (the 3-wide gate row).
  state.player = { x: YARD_GATE_X, y: YARD_GATE_Y }
  state.currentZone = Zone.LittleHouseYard
  entry.entryReturnTile = { x: apron.x, y: apron.y }
  sampleYardFlora(state)
  recordDiscovery(state, 'zone:yard')
  clearYardUiState(state)
}

/**
 * Enter the yard from the house interior. Player exits through the
 * front door and lands one tile south of the front door tile — on the
 * walkable yard ground immediately in front of the door.
 * entryReturnTile is left untouched (the gate exit consumes it; an
 * exit via the house door is not paired with an overworld apron
 * return).
 */
export const enterLittleHouseYardFromHouse = (state: GameState): void => {
  const entry = state.thresholdZones.get(LITTLE_HOUSE_YARD_ID)
  if (!entry || entry.map.length === 0 || !entry.frontDoorPosition) {
    console.warn('enterLittleHouseYardFromHouse called with no yard registered; skipping')
    return
  }
  state.map = entry.map
  state.mapWidth = entry.width
  state.mapHeight = entry.height
  state.player = {
    x: entry.frontDoorPosition.x,
    y: entry.frontDoorPosition.y + 1,
  }
  state.currentZone = Zone.LittleHouseYard
  sampleYardFlora(state)
  recordDiscovery(state, 'zone:yard')
  clearYardUiState(state)
}

/**
 * Exit the yard via the gate. Player returns to the overworld at the
 * registry entry's entryReturnTile; if null (defensive — e.g. saves
 * predating RP-67, or a player who entered the yard via the house door
 * and walked to the gate without ever touching the apron), the player
 * is placed at a safe tile near houseEntranceOverworld.
 *
 * The re-entry lock is armed on the apron tile so the next overworld
 * step doesn't immediately re-enter the yard.
 */
export const exitLittleHouseYardToOverworld = (state: GameState): void => {
  const entry = state.thresholdZones.get(LITTLE_HOUSE_YARD_ID)
  const returnTile =
    entry?.entryReturnTile ??
    findSafeExitPosition(state.houseEntranceOverworld, state.overworldMap, state.overworldMapWidth, state.overworldMapHeight, 2)
  state.map = state.overworldMap
  state.mapWidth = state.overworldMapWidth
  state.mapHeight = state.overworldMapHeight
  state.currentZone = Zone.Overworld
  state.player = { x: returnTile.x, y: returnTile.y }
  armReentryLock(state, returnTile)
  if (entry) entry.entryReturnTile = null
  clearYardUiState(state)
}

// Register yard swap handlers — module-load side effect, mirrors
// house.ts:200-205.
registerZoneSwapHandler('yard', 'enter', (state, transition) => {
  // irisCenter for the apron→yard path is the apron tile the player
  // walked onto. We pass that through as the registry's entryReturnTile.
  enterLittleHouseYardFromApron(state, transition.irisCenter)
})
registerZoneSwapHandler('yard', 'exit', state => {
  exitLittleHouseYardToOverworld(state)
})
registerZoneSwapHandler('house-to-yard', 'exit', state => {
  enterLittleHouseYardFromHouse(state)
})
