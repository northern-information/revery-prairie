// RP-69 — Whine, Haunted Village.
//
// This module owns Zone.WhineVillage and Zone.WhineHomeYard:
//   - createWhineVillage builds the deterministic 30x20 village map
//   - createWhineHomeYard builds one instance of the shared 9x7
//     per-home yard template
//   - registerWhineVillage and registerWhineHomeYards insert the
//     entries into state.thresholdZones at genesis
//   - placeWhineOnOverworld scans the east band from
//     houseEntranceOverworld and stamps WhineEntrance + WhineApron
//     onto the overworld map (or records a null entrance if no
//     valid 3x3 Dirt footprint is found)
//
// Transition handlers and ghost spawning land in subsequent tasks.
//
// Spec: harness/specs/RP-69-whine-haunted-village.yaml
// Doctrine: docs/backlog-thinktank-v11.md round 9.

import {
  SPACE_BORDER,
  WHINE_GATE_X,
  WHINE_GATE_Y,
  WHINE_HEIGHT,
  WHINE_HOME_COUNT_PER_SIDE,
  WHINE_HOME_CENTER_X_BASE,
  WHINE_HOME_CENTER_X_STRIDE,
  WHINE_HOME_YARD_GATE_X,
  WHINE_HOME_YARD_GATE_Y,
  WHINE_HOME_YARD_HEIGHT,
  WHINE_HOME_YARD_ROOF_MAX_X,
  WHINE_HOME_YARD_ROOF_MAX_Y,
  WHINE_HOME_YARD_ROOF_MIN_X,
  WHINE_HOME_YARD_ROOF_MIN_Y,
  WHINE_HOME_YARD_WIDTH,
  WHINE_NORTH_HOME_BOTTOM_Y,
  WHINE_NORTH_HOME_TOP_Y,
  WHINE_PLACEMENT_DISTANCES,
  WHINE_PLACEMENT_DY_OFFSETS,
  WHINE_SOUTH_HOME_BOTTOM_Y,
  WHINE_SOUTH_HOME_TOP_Y,
  WHINE_WIDTH,
} from './constants'
import { clearAllGrowthPreviews } from './floraGrowthPreviews'
import { recordDiscovery } from './manual'
import { clearMovementTweens } from './movementTween'
import { findSafeExitPosition, posKey } from './position'
import { TileType, Zone } from './types'
import { armReentryLock, registerZoneSwapHandler } from './zoneTransition'

import type { GameState, GateBinding, Position, ThresholdZoneState, Tile } from './types'

// Registry id stems. The village itself is a single id; per-home yards
// are zero-padded ('whine-home-01' through 'whine-home-12').
export const WHINE_VILLAGE_ID = 'whineVillage'
export const WHINE_HOME_YARD_ID_PREFIX = 'whine-home-'

export const whineHomeYardId = (homeNumber: number): string =>
  `${WHINE_HOME_YARD_ID_PREFIX}${homeNumber.toString().padStart(2, '0')}`

const homeCenterX = (i: number): number => WHINE_HOME_CENTER_X_BASE + WHINE_HOME_CENTER_X_STRIDE * i

/**
 * The twelve home descriptors. North homes occupy indices 0..5 (home
 * numbers 1..6) along the top of the village; south homes occupy
 * indices 6..11 (home numbers 7..12) along the bottom. Each row's
 * threshold gate sits on the side of the footprint that faces the
 * main street row.
 */
export interface WhineHomeDescriptor {
  homeNumber: number
  side: 'north' | 'south'
  centerX: number
  footprintTopY: number
  footprintBottomY: number
  gatePosition: Position
}

export const WHINE_HOMES: readonly WhineHomeDescriptor[] = (() => {
  const homes: WhineHomeDescriptor[] = []
  for (let i = 0; i < WHINE_HOME_COUNT_PER_SIDE; i++) {
    const centerX = homeCenterX(i)
    homes.push({
      homeNumber: i + 1,
      side: 'north',
      centerX,
      footprintTopY: WHINE_NORTH_HOME_TOP_Y,
      footprintBottomY: WHINE_NORTH_HOME_BOTTOM_Y,
      // South-facing gate on the home's south edge — faces main street.
      gatePosition: { x: centerX, y: WHINE_NORTH_HOME_BOTTOM_Y },
    })
  }
  for (let i = 0; i < WHINE_HOME_COUNT_PER_SIDE; i++) {
    const centerX = homeCenterX(i)
    homes.push({
      homeNumber: i + 1 + WHINE_HOME_COUNT_PER_SIDE,
      side: 'south',
      centerX,
      footprintTopY: WHINE_SOUTH_HOME_TOP_Y,
      footprintBottomY: WHINE_SOUTH_HOME_BOTTOM_Y,
      // North-facing gate on the home's north edge — faces main street.
      gatePosition: { x: centerX, y: WHINE_SOUTH_HOME_TOP_Y },
    })
  }
  return homes
})()

/**
 * Build the deterministic 30x20 Whine map and its gate bindings. No
 * RNG. Layout (v11 R9 lock; numbers in spec frontmatter):
 *
 *   - perimeter ring is Fence with a single west-edge FenceGate at
 *     (0, 10)
 *   - main street is walkable Dirt at y = 10, x ∈ [1, 28]
 *   - six 4x4 homes per side, centers at x ∈ {3, 8, 13, 18, 23, 28},
 *     footprint y ∈ [1, 4] (north) and y ∈ [15, 18] (south)
 *   - each home's roof: HouseRoof inner 2x2 at (centerX, centerX+1)
 *     × (footprintTopY+1, footprintBottomY-1); HouseEaves on the
 *     surrounding 12 perimeter cells of the 4x4 footprint
 *   - each home's threshold gate: FenceGate at the column centerX on
 *     the row of the footprint that faces the street (south edge for
 *     north homes; north edge for south homes), replacing the eaves
 *     cell that would otherwise sit there
 */
export interface WhineVillageResult {
  map: Tile[][]
  width: number
  height: number
  gatePositions: Map<string, GateBinding>
}

export const createWhineVillage = (): WhineVillageResult => {
  const width = WHINE_WIDTH
  const height = WHINE_HEIGHT
  const map: Tile[][] = []
  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < width; x++) {
      const onPerimeter = x === 0 || y === 0 || x === width - 1 || y === height - 1
      row.push({ type: onPerimeter ? TileType.Fence : TileType.Dirt })
    }
    map.push(row)
  }

  // West perimeter gate — single FenceGate on the village's only
  // overworld-facing edge.
  map[WHINE_GATE_Y][WHINE_GATE_X] = { type: TileType.FenceGate }

  // Twelve homes, six per side.
  for (const home of WHINE_HOMES) {
    const minX = home.centerX - 1
    const maxX = home.centerX + 2
    // Footprint perimeter → HouseEaves; inner cells → HouseRoof.
    for (let y = home.footprintTopY; y <= home.footprintBottomY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const onPerimeter = x === minX || x === maxX || y === home.footprintTopY || y === home.footprintBottomY
        map[y][x] = { type: onPerimeter ? TileType.HouseEaves : TileType.HouseRoof }
      }
    }
    // Replace the eaves cell at the threshold gate with FenceGate.
    map[home.gatePosition.y][home.gatePosition.x] = { type: TileType.FenceGate }
  }

  // Gate bindings. The west perimeter gate exits to the overworld;
  // each home's threshold gate enters that home's per-home yard zone.
  const gatePositions = new Map<string, GateBinding>()
  gatePositions.set(posKey(WHINE_GATE_X, WHINE_GATE_Y), {
    kind: 'exit',
    targetIsOverworld: true,
  })
  for (const home of WHINE_HOMES) {
    gatePositions.set(posKey(home.gatePosition.x, home.gatePosition.y), {
      kind: 'enter',
      targetZoneId: whineHomeYardId(home.homeNumber),
    })
  }

  return { map, width, height, gatePositions }
}

/**
 * Build one instance of the shared 9x7 Whine home yard template. No
 * RNG. Layout (v11 R9 lock):
 *
 *   - perimeter ring is Fence with a single FenceGate at the south
 *     edge center (4, 6)
 *   - roof block: HouseRoof on the inner 3x2 at x ∈ [3, 5], y ∈ [1, 2]
 *   - HouseEaves on the 5x3 perimeter at x ∈ [2, 6], y ∈ [1, 3] minus
 *     the inner roof cells (so eaves wraps the roof — house seen from
 *     outside)
 *   - no HouseDoorClosed — homes are not enterable in v1
 *   - everything else is Dirt
 *
 * Returns a fresh map each call so the registry can hold twelve
 * independent instances without shared references.
 */
export interface WhineHomeYardResult {
  map: Tile[][]
  width: number
  height: number
  gatePositions: Map<string, GateBinding>
}

export const createWhineHomeYard = (): WhineHomeYardResult => {
  const width = WHINE_HOME_YARD_WIDTH
  const height = WHINE_HOME_YARD_HEIGHT
  const map: Tile[][] = []
  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < width; x++) {
      const onFence = x === 0 || y === 0 || x === width - 1 || y === height - 1
      row.push({ type: onFence ? TileType.Fence : TileType.Dirt })
    }
    map.push(row)
  }
  // South gate centered on the south fence edge.
  map[WHINE_HOME_YARD_GATE_Y][WHINE_HOME_YARD_GATE_X] = { type: TileType.FenceGate }
  // 5x3 perimeter eaves + inner 3x2 roof.
  for (let y = WHINE_HOME_YARD_ROOF_MIN_Y; y <= WHINE_HOME_YARD_ROOF_MAX_Y; y++) {
    for (let x = WHINE_HOME_YARD_ROOF_MIN_X; x <= WHINE_HOME_YARD_ROOF_MAX_X; x++) {
      const onPerimeter =
        x === WHINE_HOME_YARD_ROOF_MIN_X ||
        x === WHINE_HOME_YARD_ROOF_MAX_X ||
        y === WHINE_HOME_YARD_ROOF_MIN_Y ||
        y === WHINE_HOME_YARD_ROOF_MAX_Y
      map[y][x] = { type: onPerimeter ? TileType.HouseEaves : TileType.HouseRoof }
    }
  }

  const gatePositions = new Map<string, GateBinding>()
  // The home yard's south gate exits back to Whine — populated with
  // targetZoneId at registration time so the binding carries the
  // parent zone id explicitly.
  gatePositions.set(posKey(WHINE_HOME_YARD_GATE_X, WHINE_HOME_YARD_GATE_Y), {
    kind: 'exit',
    targetZoneId: WHINE_VILLAGE_ID,
  })

  return { map, width, height, gatePositions }
}

/**
 * Register Whine and all twelve per-home yards into state.thresholdZones.
 * Called once at genesis by createGameState.
 */
export const registerWhineVillage = (state: GameState, village: WhineVillageResult): void => {
  const entry: ThresholdZoneState = {
    id: WHINE_VILLAGE_ID,
    zoneVariant: Zone.WhineVillage,
    map: village.map,
    width: village.width,
    height: village.height,
    gatePositions: village.gatePositions,
    entryReturnTile: null,
    pausesPlayerTime: true,
  }
  state.thresholdZones.set(WHINE_VILLAGE_ID, entry)
}

export const registerWhineHomeYards = (state: GameState): void => {
  for (const home of WHINE_HOMES) {
    const yard = createWhineHomeYard()
    const entry: ThresholdZoneState = {
      id: whineHomeYardId(home.homeNumber),
      zoneVariant: Zone.WhineHomeYard,
      map: yard.map,
      width: yard.width,
      height: yard.height,
      gatePositions: yard.gatePositions,
      entryReturnTile: null,
      pausesPlayerTime: true,
    }
    state.thresholdZones.set(entry.id, entry)
  }
}

/**
 * Walk the deterministic east-band ring described in the spec and
 * find a 3x3 Dirt footprint that doesn't conflict with any existing
 * structure tile. If found, stamp WhineEntrance at the center and
 * WhineApron on the 8 neighbors; return the chosen position.
 * Returns null if no candidate fits — Whine is still registered but
 * unreachable for the tenure.
 *
 * Genesis-time only. The caller (state.ts) writes
 * state.whineEntranceOverworld with the result.
 */
const STRUCTURE_TILE_TYPES = new Set<TileType>([
  TileType.CaveEntrance,
  TileType.CaveApron,
  TileType.RuinEntrance,
  TileType.RuinApron,
  TileType.RuinWall,
  TileType.RuinDoorLocked,
  TileType.RuinDoorOpen,
  TileType.RuinAqueduct,
  TileType.HouseEntrance,
  TileType.HouseApron,
])

const isPlacementCandidate = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  cx: number,
  cy: number
): boolean => {
  // 3x3 footprint must sit inside the SPACE_BORDER margin and contain
  // only Dirt (no structure tiles, no water, no anything else).
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < SPACE_BORDER || x >= mapWidth - SPACE_BORDER) return false
      if (y < SPACE_BORDER || y >= mapHeight - SPACE_BORDER) return false
      const tile = map[y]?.[x]
      if (!tile) return false
      if (tile.type !== TileType.Dirt) return false
      if (STRUCTURE_TILE_TYPES.has(tile.type)) return false
    }
  }
  return true
}

export const placeWhineOnOverworld = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  houseEntrance: Position
): Position | null => {
  // The spec proposes a strict +25 offset; if that fails, walk the
  // ring (distance, dy) in the order defined in constants.ts. The
  // first candidate that passes isPlacementCandidate wins.
  for (const distance of WHINE_PLACEMENT_DISTANCES) {
    for (const dy of WHINE_PLACEMENT_DY_OFFSETS) {
      const cx = houseEntrance.x + distance
      const cy = houseEntrance.y + dy
      if (isPlacementCandidate(map, mapWidth, mapHeight, cx, cy)) {
        // Stamp WhineEntrance + 8 WhineApron neighbors.
        map[cy][cx] = { type: TileType.WhineEntrance }
        for (let ddy = -1; ddy <= 1; ddy++) {
          for (let ddx = -1; ddx <= 1; ddx++) {
            if (ddx === 0 && ddy === 0) continue
            map[cy + ddy][cx + ddx] = { type: TileType.WhineApron }
          }
        }
        return { x: cx, y: cy }
      }
    }
  }
  console.warn('whine: no overworld placement found in east band; skipping entrance')
  return null
}

// --- Transition handlers ---
//
// Mirror yard.ts: each handler swaps state.map (and dims) to the
// destination threshold zone's map, clears UI/input state, and updates
// state.currentZone. The transition system invokes these after the
// iris reaches its midpoint.

const clearWhineUiState = (state: GameState): void => {
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
 * Enter Whine from the overworld. Player lands at the west gate; the
 * overworld apron tile that triggered the transition is stashed on the
 * Whine registry entry's entryReturnTile so the gate exit can return
 * the steward to the same tile they walked in from.
 */
export const enterWhineVillage = (state: GameState, apron: Position): void => {
  const entry = state.thresholdZones.get(WHINE_VILLAGE_ID)
  if (!entry || entry.map.length === 0) {
    console.warn('enterWhineVillage called with no village registered; skipping')
    return
  }
  state.map = entry.map
  state.mapWidth = entry.width
  state.mapHeight = entry.height
  // Land at the west gate tile.
  state.player = { x: WHINE_GATE_X, y: WHINE_GATE_Y }
  state.currentZone = Zone.WhineVillage
  entry.entryReturnTile = { x: apron.x, y: apron.y }
  recordDiscovery(state, 'zone:whine')
  clearWhineUiState(state)
}

/**
 * Exit Whine via the west gate. Player returns to the overworld at
 * the registry entry's entryReturnTile; the re-entry lock is armed
 * on that tile so the next overworld step doesn't yo-yo back in.
 * Defensive fallback if the entry is missing (save-load before RP-69):
 * land near houseEntranceOverworld via findSafeExitPosition.
 */
export const exitWhineVillageToOverworld = (state: GameState): void => {
  const entry = state.thresholdZones.get(WHINE_VILLAGE_ID)
  const fallback = state.whineEntranceOverworld ?? state.houseEntranceOverworld
  const returnTile =
    entry?.entryReturnTile ??
    findSafeExitPosition(fallback, state.overworldMap, state.overworldMapWidth, state.overworldMapHeight, 2)
  state.map = state.overworldMap
  state.mapWidth = state.overworldMapWidth
  state.mapHeight = state.overworldMapHeight
  state.currentZone = Zone.Overworld
  state.player = { x: returnTile.x, y: returnTile.y }
  armReentryLock(state, returnTile)
  if (entry) entry.entryReturnTile = null
  clearWhineUiState(state)
}

/**
 * Enter a Whine home yard from Whine. The home is identified by the
 * gate tile the steward stepped onto — the binding in Whine's
 * gatePositions Map carries the target zone id (e.g. 'whine-home-03').
 * The Whine gate tile is stashed on the home yard's entryReturnTile so
 * the exit handler can return the steward to the same gate they came
 * in through.
 */
export const enterWhineHomeYard = (state: GameState, gateTileInWhine: Position): void => {
  const village = state.thresholdZones.get(WHINE_VILLAGE_ID)
  const binding = village?.gatePositions.get(posKey(gateTileInWhine.x, gateTileInWhine.y))
  if (binding?.kind !== 'enter' || !binding.targetZoneId) {
    console.warn(`whine: gate at (${String(gateTileInWhine.x)}, ${String(gateTileInWhine.y)}) has no enter binding; skipping`)
    return
  }
  const entry = state.thresholdZones.get(binding.targetZoneId)
  if (!entry || entry.map.length === 0) {
    console.warn(`whine: target zone '${binding.targetZoneId}' not registered; skipping`)
    return
  }
  state.map = entry.map
  state.mapWidth = entry.width
  state.mapHeight = entry.height
  // Land one tile north of the home yard's south gate — just inside
  // the fence, facing the home.
  state.player = { x: WHINE_HOME_YARD_GATE_X, y: WHINE_HOME_YARD_GATE_Y - 1 }
  state.currentZone = Zone.WhineHomeYard
  entry.entryReturnTile = { x: gateTileInWhine.x, y: gateTileInWhine.y }
  clearWhineUiState(state)
}

/**
 * Exit a Whine home yard back to Whine. The home yard's
 * entryReturnTile holds the Whine gate tile the steward came in
 * through; the player lands one tile north of that gate (for north
 * homes, that puts them on the street side of the home's fence; for
 * south homes, the street is to the north anyway). Defensive
 * fallback: place the player at Whine's west gate.
 */
export const exitWhineHomeYardToVillage = (state: GameState): void => {
  // Look up the currently-occupied home yard via state.map identity —
  // walk all 'whine-home-*' entries and find the one whose map matches.
  let currentHome: ThresholdZoneState | null = null
  for (const entry of state.thresholdZones.values()) {
    if (entry.zoneVariant === Zone.WhineHomeYard && entry.map === state.map) {
      currentHome = entry
      break
    }
  }
  const village = state.thresholdZones.get(WHINE_VILLAGE_ID)
  if (!village) {
    console.warn('whine: no village registered; cannot exit home yard')
    return
  }
  state.map = village.map
  state.mapWidth = village.width
  state.mapHeight = village.height
  state.currentZone = Zone.WhineVillage
  const returnTile = currentHome?.entryReturnTile ?? { x: WHINE_GATE_X, y: WHINE_GATE_Y + 1 }
  // Land just inside Whine — one tile south of the home's gate for
  // north homes (gate.y is the home's bottom row, so step to y+1),
  // one tile north of the gate for south homes (gate.y is the home's
  // top row, so step to y-1). Discriminate by whether the gate's y
  // is in the upper half of the village.
  const isNorthHome = returnTile.y < village.height / 2
  state.player = isNorthHome ? { x: returnTile.x, y: returnTile.y + 1 } : { x: returnTile.x, y: returnTile.y - 1 }
  if (currentHome) currentHome.entryReturnTile = null
  clearWhineUiState(state)
}

// Module-load registrations. Mirrors yard.ts at the bottom — registering
// at module scope means consumers just need to import this file (state.ts
// already does) for the handlers to be hooked up.
registerZoneSwapHandler('whine', 'enter', (state, transition) => {
  enterWhineVillage(state, transition.irisCenter)
})
registerZoneSwapHandler('whine', 'exit', state => {
  exitWhineVillageToOverworld(state)
})
registerZoneSwapHandler('whine-home', 'enter', (state, transition) => {
  enterWhineHomeYard(state, transition.irisCenter)
})
registerZoneSwapHandler('whine-home', 'exit', state => {
  exitWhineHomeYardToVillage(state)
})
