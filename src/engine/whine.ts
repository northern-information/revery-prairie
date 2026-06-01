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
  WHINE_EAST_HOME_LEFT_X,
  WHINE_EAST_HOME_RIGHT_X,
  WHINE_GATE_X,
  WHINE_GATE_Y,
  WHINE_HEIGHT,
  WHINE_HOME_COUNT_PER_SIDE,
  WHINE_HOME_CENTER_Y_BASE,
  WHINE_HOME_CENTER_Y_STRIDE,
  WHINE_HOME_YARD_GATE_X,
  WHINE_HOME_YARD_GATE_Y,
  WHINE_HOME_YARD_HEIGHT,
  WHINE_HOME_YARD_ROOF_MAX_X,
  WHINE_HOME_YARD_ROOF_MAX_Y,
  WHINE_HOME_YARD_ROOF_MIN_X,
  WHINE_HOME_YARD_ROOF_MIN_Y,
  WHINE_HOME_YARD_WIDTH,
  WHINE_PLACEMENT_DISTANCES,
  WHINE_PLACEMENT_DY_OFFSETS,
  WHINE_WEST_HOME_LEFT_X,
  WHINE_WEST_HOME_RIGHT_X,
  WHINE_WIDTH,
} from './constants'
import { clearAllGrowthPreviews } from './floraGrowthPreviews'
import { recordDiscovery } from './manual'
import { clearMovementTweens } from './movementTween'
import { spawnZoneOak } from './oaks'
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

const homeCenterY = (i: number): number => WHINE_HOME_CENTER_Y_BASE + WHINE_HOME_CENTER_Y_STRIDE * i

// RP-69a — hand-authored variation across the twelve homes. No RNG; the
// same values every tenure. Each entry is keyed by home number ∈ [1, 12];
// index 0 is a no-op placeholder so callers can index by homeNumber
// directly. The variation system layers these overrides onto the shared
// village + yard templates inside createWhineVillage and
// createWhineHomeYard.
//
// Constraints (asserted by tests in whine.test.ts, not enforced at
// runtime):
//   - villageJitter.dx ∈ [-2, 2], villageJitter.dy ∈ [-1, 1].
//     Footprints must stay inside the 66 × 40 village, must not cross
//     the main street row y = 20, and must not overlap each other.
//   - yardRoofOffset.dx ∈ [-1, 1], yardRoofOffset.dy ∈ [0, 1]. (Negative
//     dy would push the roof onto the north perimeter Fence row.)
//   - oak, when non-null, is a yard-local anchor whose 5 × 5 footprint
//     fits inside the yard interior (anchor.x ∈ [3, 11], anchor.y ∈
//     [6, 9] given the default roof at y ∈ [1, 3] and gate at y = 12).
//   - brokenFenceSegments and missingFenceSegments only reference yard
//     perimeter cells, and never the FenceGate at (7, 12). The two
//     lists are disjoint (a cell cannot be both broken and missing).
export interface WhineHomeVariant {
  villageJitter: { dx: number; dy: number }
  yardRoofOffset: { dx: number; dy: number }
  oak: Position | null
  brokenFenceSegments: readonly Position[]
  missingFenceSegments: readonly Position[]
}

const NO_VARIANT: WhineHomeVariant = {
  villageJitter: { dx: 0, dy: 0 },
  yardRoofOffset: { dx: 0, dy: 0 },
  oak: null,
  brokenFenceSegments: [],
  missingFenceSegments: [],
}

// 13-entry array. Index 0 is unused (no home zero); indices 1..12 carry
// the hand-authored variation. The array form keeps lookups as a single
// indexed access while still letting the author scan the file top-to-
// bottom for the per-home tweaks.
export const WHINE_HOME_VARIANTS: readonly WhineHomeVariant[] = [
  NO_VARIANT, // index 0 — unused
  // Home 1 — NW corner, well-kept. Slight inward jitter; no decay.
  {
    villageJitter: { dx: -1, dy: 0 },
    yardRoofOffset: { dx: 0, dy: 0 },
    oak: null,
    brokenFenceSegments: [],
    missingFenceSegments: [],
  },
  // Home 2 — north row, second from left. Oak in the back-east of the
  // yard; the front gate looks intact.
  {
    villageJitter: { dx: 0, dy: 1 },
    yardRoofOffset: { dx: -1, dy: 0 },
    oak: { x: 11, y: 7 },
    brokenFenceSegments: [{ x: 0, y: 6 }],
    missingFenceSegments: [],
  },
  // Home 3 — north row, middle. Visible decay. Multiple broken posts
  // and a missing segment along the east fence.
  {
    villageJitter: { dx: 1, dy: 0 },
    yardRoofOffset: { dx: 1, dy: 0 },
    oak: null,
    brokenFenceSegments: [
      { x: 14, y: 4 },
      { x: 14, y: 5 },
      { x: 3, y: 0 },
    ],
    missingFenceSegments: [{ x: 14, y: 6 }],
  },
  // Home 4 — north row, fourth. Oak hugging the SW corner of the yard.
  {
    villageJitter: { dx: -1, dy: -1 },
    yardRoofOffset: { dx: 0, dy: 1 },
    oak: { x: 3, y: 9 },
    brokenFenceSegments: [{ x: 0, y: 9 }],
    missingFenceSegments: [],
  },
  // Home 5 — north row, fifth. The "pristine outlier" — full +2 dx
  // jitter but otherwise unmarked.
  {
    villageJitter: { dx: 2, dy: 0 },
    yardRoofOffset: { dx: 0, dy: 0 },
    oak: null,
    brokenFenceSegments: [],
    missingFenceSegments: [],
  },
  // Home 6 — north row, eastmost. Oak + multiple broken fences.
  {
    villageJitter: { dx: 0, dy: 1 },
    yardRoofOffset: { dx: -1, dy: 1 },
    oak: { x: 9, y: 8 },
    brokenFenceSegments: [
      { x: 0, y: 3 },
      { x: 14, y: 8 },
      { x: 5, y: 12 },
    ],
    missingFenceSegments: [],
  },
  // Home 7 — south row, leftmost. Pristine south-row anchor.
  {
    villageJitter: { dx: 1, dy: -1 },
    yardRoofOffset: { dx: 1, dy: 1 },
    oak: null,
    brokenFenceSegments: [],
    missingFenceSegments: [],
  },
  // Home 8 — south row, second. Oak + one broken + one missing.
  {
    villageJitter: { dx: -1, dy: 0 },
    yardRoofOffset: { dx: 0, dy: 0 },
    oak: { x: 5, y: 9 },
    brokenFenceSegments: [{ x: 9, y: 12 }],
    missingFenceSegments: [{ x: 14, y: 7 }],
  },
  // Home 9 — south row, middle. Worn fence; no oak.
  {
    villageJitter: { dx: 0, dy: 1 },
    yardRoofOffset: { dx: -1, dy: 0 },
    oak: null,
    brokenFenceSegments: [
      { x: 4, y: 0 },
      { x: 10, y: 0 },
    ],
    missingFenceSegments: [],
  },
  // Home 10 — south row, fourth. Heavy decay; oak in the back yard.
  {
    villageJitter: { dx: 2, dy: 1 },
    yardRoofOffset: { dx: 1, dy: 0 },
    oak: { x: 7, y: 8 },
    brokenFenceSegments: [
      { x: 0, y: 5 },
      { x: 0, y: 6 },
      { x: 14, y: 5 },
    ],
    missingFenceSegments: [
      { x: 0, y: 7 },
      { x: 14, y: 6 },
    ],
  },
  // Home 11 — south row, fifth. Single missing segment along the north
  // fence; reads as "the boundary failed but no one fixed it."
  {
    villageJitter: { dx: -2, dy: -1 },
    yardRoofOffset: { dx: 0, dy: 1 },
    oak: null,
    brokenFenceSegments: [],
    missingFenceSegments: [{ x: 6, y: 0 }],
  },
  // Home 12 — SE corner, pristine. Matches Home 1 as the village's
  // "kept-up corners" pair.
  {
    villageJitter: { dx: 0, dy: 0 },
    yardRoofOffset: { dx: 0, dy: 0 },
    oak: null,
    brokenFenceSegments: [],
    missingFenceSegments: [],
  },
]

/**
 * The twelve home descriptors. West homes occupy indices 0..5 (home
 * numbers 1..6) along the left side of the village; east homes occupy
 * indices 6..11 (home numbers 7..12) along the right side. Each home's
 * threshold gate sits on the side of the footprint that faces the
 * main street column.
 *
 * `villageJitter.dx` shifts the home's left/right footprint columns;
 * `villageJitter.dy` shifts the home's center along the long axis of
 * the village (north/south). Both are per-home and hand-authored in
 * `WHINE_HOME_VARIANTS`.
 */
export interface WhineHomeDescriptor {
  homeNumber: number
  side: 'west' | 'east'
  centerY: number
  footprintLeftX: number
  footprintRightX: number
  gatePosition: Position
}

export const WHINE_HOMES: readonly WhineHomeDescriptor[] = (() => {
  const homes: WhineHomeDescriptor[] = []
  for (let i = 0; i < WHINE_HOME_COUNT_PER_SIDE; i++) {
    const homeNumber = i + 1
    const { dx, dy } = WHINE_HOME_VARIANTS[homeNumber].villageJitter
    const centerY = homeCenterY(i) + dy
    homes.push({
      homeNumber,
      side: 'west',
      centerY,
      footprintLeftX: WHINE_WEST_HOME_LEFT_X + dx,
      footprintRightX: WHINE_WEST_HOME_RIGHT_X + dx,
      // East-facing gate on the home's east edge — faces main street.
      gatePosition: { x: WHINE_WEST_HOME_RIGHT_X + dx, y: centerY },
    })
  }
  for (let i = 0; i < WHINE_HOME_COUNT_PER_SIDE; i++) {
    const homeNumber = i + 1 + WHINE_HOME_COUNT_PER_SIDE
    const { dx, dy } = WHINE_HOME_VARIANTS[homeNumber].villageJitter
    const centerY = homeCenterY(i) + dy
    homes.push({
      homeNumber,
      side: 'east',
      centerY,
      footprintLeftX: WHINE_EAST_HOME_LEFT_X + dx,
      footprintRightX: WHINE_EAST_HOME_RIGHT_X + dx,
      // West-facing gate on the home's west edge — faces main street.
      gatePosition: { x: WHINE_EAST_HOME_LEFT_X + dx, y: centerY },
    })
  }
  return homes
})()

/**
 * Build the deterministic 40×66 Whine map and its gate bindings. No
 * RNG. RP-69a layout (rotated 90° from the original wide-format
 * village; numbers in spec frontmatter):
 *
 *   - perimeter ring is Fence with a 3-wide south-facing FenceGate
 *     at x ∈ [WHINE_GATE_X - 1, WHINE_GATE_X + 1], y = WHINE_GATE_Y
 *   - main street is walkable Dirt at x = WHINE_MAIN_STREET_X,
 *     y ∈ [1, height - 2]
 *   - six 4×4 homes per side. West homes at footprint x ∈ [3, 6];
 *     east homes at x ∈ [33, 36]. Each side's home centers along y
 *     are {7, 17, 27, 37, 47, 57}
 *   - each home's roof: HouseRoof inner 2×2 at (centerY - 1, centerY)
 *     × (footprintLeftX + 1, footprintRightX - 1); HouseEaves on the
 *     surrounding 12 perimeter cells of the 4×4 footprint
 *   - each home's threshold gate: FenceGate at the row centerY on
 *     the column of the footprint that faces the street (east edge
 *     for west homes; west edge for east homes), replacing the eaves
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

  // South perimeter gate — 3-wide FenceGate on the south fence,
  // centered on WHINE_GATE_X. This is the village's only overworld-
  // facing threshold.
  for (let dx = -1; dx <= 1; dx++) {
    map[WHINE_GATE_Y][WHINE_GATE_X + dx] = { type: TileType.FenceGate }
  }

  // Twelve homes, six per side. Footprint corners come from the
  // descriptor's (footprintLeftX, footprintRightX) × 4 rows centered
  // on centerY.
  for (const home of WHINE_HOMES) {
    const minX = home.footprintLeftX
    const maxX = home.footprintRightX
    const minY = home.centerY - 1
    const maxY = home.centerY + 2
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const onPerimeter = x === minX || x === maxX || y === minY || y === maxY
        map[y][x] = { type: onPerimeter ? TileType.HouseEaves : TileType.HouseRoof }
      }
    }
    // Replace the eaves cell at the threshold gate with FenceGate.
    map[home.gatePosition.y][home.gatePosition.x] = { type: TileType.FenceGate }
  }

  // Gate bindings. The south perimeter gate exits to the overworld;
  // each of the three FenceGate tiles in the 3-wide threshold binds to
  // the same overworld exit. Each home's threshold gate enters that
  // home's per-home yard zone.
  const gatePositions = new Map<string, GateBinding>()
  for (let dx = -1; dx <= 1; dx++) {
    gatePositions.set(posKey(WHINE_GATE_X + dx, WHINE_GATE_Y), {
      kind: 'exit',
      targetIsOverworld: true,
    })
  }
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

export const createWhineHomeYard = (homeNumber: number): WhineHomeYardResult => {
  const width = WHINE_HOME_YARD_WIDTH
  const height = WHINE_HOME_YARD_HEIGHT
  const variant = WHINE_HOME_VARIANTS[homeNumber]
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

  // Roof block — base position is the 5×3 region (HouseEaves perimeter
  // + HouseRoof inner). RP-69a shifts the block by variant.yardRoofOffset
  // so each home's house sits in a slightly different spot inside its
  // yard. Author constraints (asserted by tests) keep the shifted block
  // inside the walkable interior.
  const roofMinX = WHINE_HOME_YARD_ROOF_MIN_X + variant.yardRoofOffset.dx
  const roofMaxX = WHINE_HOME_YARD_ROOF_MAX_X + variant.yardRoofOffset.dx
  const roofMinY = WHINE_HOME_YARD_ROOF_MIN_Y + variant.yardRoofOffset.dy
  const roofMaxY = WHINE_HOME_YARD_ROOF_MAX_Y + variant.yardRoofOffset.dy
  for (let y = roofMinY; y <= roofMaxY; y++) {
    for (let x = roofMinX; x <= roofMaxX; x++) {
      const onPerimeter = x === roofMinX || x === roofMaxX || y === roofMinY || y === roofMaxY
      map[y][x] = { type: onPerimeter ? TileType.HouseEaves : TileType.HouseRoof }
    }
  }

  // RP-69a — per-home fence weathering. Broken segments swap Fence for
  // the walkable BrokenFence tile; missing segments swap Fence for plain
  // Dirt (a full gap in the perimeter).
  for (const p of variant.brokenFenceSegments) {
    map[p.y][p.x] = { type: TileType.BrokenFence }
  }
  for (const p of variant.missingFenceSegments) {
    map[p.y][p.x] = { type: TileType.Dirt }
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
    const yard = createWhineHomeYard(home.homeNumber)
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

    // RP-69a — if this home's variant has a yard oak, spawn the ECS
    // entity now. EntityZone scopes it to this specific yard so the
    // renderer's oak loop only paints it when the steward is inside.
    // Identity seed is `${stewardName}:${yardId}` so the same yard in
    // two different tenures still produces distinct oak genetics.
    const variant = WHINE_HOME_VARIANTS[home.homeNumber]
    if (variant.oak !== null) {
      spawnZoneOak(state, variant.oak.x, variant.oak.y, 0, Zone.WhineHomeYard, `${state.stewardName}:${entry.id}`)
    }
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
  // first candidate that passes isPlacementCandidate wins. RP-69a:
  // the entrance is now a 1x3 horizontal strip (three WhineEntrance
  // tiles centered E-W at the chosen position). The 3x3 footprint
  // check still applies — the entrance row needs clear Dirt and the
  // neighboring rows stay Dirt (no apron tile is stamped).
  for (const distance of WHINE_PLACEMENT_DISTANCES) {
    for (const dy of WHINE_PLACEMENT_DY_OFFSETS) {
      const cx = houseEntrance.x + distance
      const cy = houseEntrance.y + dy
      if (isPlacementCandidate(map, mapWidth, mapHeight, cx, cy)) {
        // Stamp three WhineEntrance tiles in a horizontal row, centered
        // on (cx, cy). The returned position is the center tile so the
        // chosen anchor matches the original 3x3 semantics.
        for (let ddx = -1; ddx <= 1; ddx++) {
          map[cy][cx + ddx] = { type: TileType.WhineEntrance }
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
  const returnTile = currentHome?.entryReturnTile ?? { x: WHINE_GATE_X, y: WHINE_GATE_Y - 1 }
  // Land just inside Whine on the main-street side of the home's gate
  // (one tile east for west homes, one tile west for east homes).
  // Discriminate by whether the gate's x is in the left half of the
  // village.
  const isWestHome = returnTile.x < village.width / 2
  state.player = isWestHome ? { x: returnTile.x + 1, y: returnTile.y } : { x: returnTile.x - 1, y: returnTile.y }
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
