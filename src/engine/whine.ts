// RP-69 + RP-69a — Whine, Haunted Village.
//
// This module owns Zone.WhineVillage:
//   - createWhineVillage builds the deterministic 40x66 village map
//     (rotated 90° from the original wide layout per RP-69a). Twelve
//     homes in west/east columns with a N-S main street; 3-wide south
//     perimeter gate; village-perimeter fence weathering applied from
//     top-level constants WHINE_VILLAGE_BROKEN_FENCE and
//     WHINE_VILLAGE_MISSING_FENCE.
//   - registerWhineVillage inserts the village into
//     state.thresholdZones at genesis and spawns the per-home oaks
//     listed in WHINE_HOME_VARIANTS.
//   - placeWhineOnOverworld scans the east band from
//     houseEntranceOverworld and stamps a 1×3 vertical WhineEntrance
//     strip wrapped by a 3×5 WhineApron footprint (or records a null
//     entrance if no valid 3×5 Dirt footprint is found).
//
// RP-69a removed the per-home yards — the village itself is the yard.
//
// Spec: harness/specs/RP-69-whine-haunted-village.yaml
// Spec: harness/specs/RP-69a-whine-variation.yaml
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

// Registry id for the single village threshold zone. RP-69a removed
// the per-home yards — the village itself reads as the yard around
// all twelve homes.
export const WHINE_VILLAGE_ID = 'whineVillage'

const homeCenterY = (i: number): number => WHINE_HOME_CENTER_Y_BASE + WHINE_HOME_CENTER_Y_STRIDE * i

// RP-69a — hand-authored variation across the twelve homes. No RNG;
// the same values every tenure. Per-home variants carry the home's
// jitter on the village map and an optional oak placed in the open
// village space near the home. Village-wide fence weathering lives
// in `WHINE_VILLAGE_BROKEN_FENCE` and `WHINE_VILLAGE_MISSING_FENCE`
// (top-level, not per-home, since the perimeter is the village's
// not any home's).
//
// Constraints (asserted by tests in whine.test.ts, not enforced at
// runtime):
//   - villageJitter.dx ∈ [-2, 2], villageJitter.dy ∈ [-1, 1].
//     Footprints must stay inside the 40 × 66 village, must not cross
//     the main street column x = 20, and must not overlap each other.
//   - oak, when non-null, is a village-local anchor whose 5 × 5
//     footprint fits inside the village interior and does not collide
//     with any home footprint, the main street, or the perimeter.
//   - WHINE_VILLAGE_BROKEN_FENCE / WHINE_VILLAGE_MISSING_FENCE only
//     reference village-perimeter cells, never one of the 3 south
//     FenceGate tiles. The two lists are disjoint.
export interface WhineHomeVariant {
  villageJitter: { dx: number; dy: number }
  oak: Position | null
}

const NO_VARIANT: WhineHomeVariant = {
  villageJitter: { dx: 0, dy: 0 },
  oak: null,
}

// 13-entry array. Index 0 is unused (no home zero); indices 1..12 carry
// the hand-authored variation. The array form keeps lookups as a single
// indexed access while still letting the author scan the file top-to-
// bottom for the per-home tweaks.
//
// Oak positions are village-local. West homes sit at footprint
// x ∈ [3, 6]; the open village space between the home and the main
// street (x = 20) gives a comfortable spot for an oak anchored
// around x = 10. East homes mirror at x = 29.
export const WHINE_HOME_VARIANTS: readonly WhineHomeVariant[] = [
  NO_VARIANT, // index 0 — unused
  // Home 1 — NW corner, well-kept. Slight inward jitter; no oak.
  { villageJitter: { dx: -1, dy: 0 }, oak: null },
  // Home 2 — west column, second from north. Oak in the village space
  // between the home and the main street.
  { villageJitter: { dx: 0, dy: 1 }, oak: { x: 10, y: 17 } },
  // Home 3 — west column, middle. Jittered east; no oak.
  { villageJitter: { dx: 1, dy: 0 }, oak: null },
  // Home 4 — west column, fourth. Oak between the home and the street.
  { villageJitter: { dx: -1, dy: -1 }, oak: { x: 11, y: 37 } },
  // Home 5 — west column, fifth. The "pristine outlier" — large dx
  // jitter but no oak.
  { villageJitter: { dx: 2, dy: 0 }, oak: null },
  // Home 6 — west column, southmost. Oak nearer the home.
  { villageJitter: { dx: 0, dy: 1 }, oak: { x: 9, y: 57 } },
  // Home 7 — east column, northmost. Pristine.
  { villageJitter: { dx: 1, dy: -1 }, oak: null },
  // Home 8 — east column, second. Oak between the home and the street.
  { villageJitter: { dx: -1, dy: 0 }, oak: { x: 29, y: 17 } },
  // Home 9 — east column, middle. No oak.
  { villageJitter: { dx: 0, dy: 1 }, oak: null },
  // Home 10 — east column, fourth. Oak between the home and the street.
  { villageJitter: { dx: 2, dy: 1 }, oak: { x: 28, y: 38 } },
  // Home 11 — east column, fifth. No oak.
  { villageJitter: { dx: -2, dy: -1 }, oak: null },
  // Home 12 — SE corner, pristine.
  { villageJitter: { dx: 0, dy: 0 }, oak: null },
]

// Village-perimeter fence variation. These positions reference cells
// on the 40×66 village's outer Fence ring; broken segments become
// `BrokenFence` (walkable, weathered glyph); missing segments become
// `Dirt` (a full gap). Authored to read as "the village's edges have
// aged unevenly" without compromising the 3-wide south FenceGate at
// (19..21, 65).
export const WHINE_VILLAGE_BROKEN_FENCE: readonly Position[] = [
  { x: 0, y: 12 },
  { x: 0, y: 28 },
  { x: 0, y: 45 },
  { x: 39, y: 8 },
  { x: 39, y: 33 },
  { x: 39, y: 52 },
  { x: 14, y: 0 },
  { x: 25, y: 0 },
]

export const WHINE_VILLAGE_MISSING_FENCE: readonly Position[] = [
  { x: 0, y: 36 },
  { x: 39, y: 22 },
]

/**
 * The twelve home descriptors. West homes occupy indices 0..5 (home
 * numbers 1..6) along the left side of the village; east homes occupy
 * indices 6..11 (home numbers 7..12) along the right side. Homes are
 * closed 4×4 blocks (HouseEaves perimeter + HouseRoof interior) — no
 * per-home threshold gate, no yard zone behind them. The village
 * itself is the yard (RP-69a).
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

  // RP-69a — village-perimeter fence weathering. Broken segments become
  // BrokenFence (walkable, weathered glyph); missing segments become
  // plain Dirt (a full gap). Applied after the FenceGate stamp so the
  // gate is never overwritten.
  for (const p of WHINE_VILLAGE_BROKEN_FENCE) {
    map[p.y][p.x] = { type: TileType.BrokenFence }
  }
  for (const p of WHINE_VILLAGE_MISSING_FENCE) {
    map[p.y][p.x] = { type: TileType.Dirt }
  }

  // Twelve homes, six per side. Footprint corners come from the
  // descriptor's (footprintLeftX, footprintRightX) × 4 rows centered
  // on centerY. RP-69a removed the per-home yards — each home is a
  // closed 4×4 block (HouseEaves perimeter + HouseRoof interior) with
  // no threshold gate. The village itself reads as the yard.
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
  }

  // Gate bindings. The 3-wide south perimeter gate exits to the
  // overworld (each of the three FenceGate tiles binds to the same
  // exit). No per-home gates — the homes are not enterable in this
  // revision.
  const gatePositions = new Map<string, GateBinding>()
  for (let dx = -1; dx <= 1; dx++) {
    gatePositions.set(posKey(WHINE_GATE_X + dx, WHINE_GATE_Y), {
      kind: 'exit',
      targetIsOverworld: true,
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
/**
 * Register Whine into state.thresholdZones. Called once at genesis by
 * createGameState. Also spawns the village oaks: each home whose
 * variant.oak is non-null gets one ECS oak placed in the village's
 * open space at the given village-local position, with EntityZone
 * scoped to Zone.WhineVillage so the renderer paints them only when
 * the steward is inside the village.
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

  // RP-69a — village oaks. Each non-null variant.oak spawns one oak
  // anchored at the given village position. Identity seeds incorporate
  // the home number so two oaks at numerically-similar coords still
  // produce distinct genetics across tenures.
  for (const home of WHINE_HOMES) {
    const variant = WHINE_HOME_VARIANTS[home.homeNumber]
    if (variant.oak !== null) {
      spawnZoneOak(
        state,
        variant.oak.x,
        variant.oak.y,
        0,
        Zone.WhineVillage,
        `${state.stewardName}:whine-home-${String(home.homeNumber)}`
      )
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
  TileType.WhineEntrance,
  TileType.WhineApron,
])

const isPlacementCandidate = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  cx: number,
  cy: number
): boolean => {
  // RP-69a — the rotated entrance is a 1×3 vertical strip wrapped by a
  // 3×5 apron footprint. The candidate check verifies the full 3×5 box
  // is inside SPACE_BORDER and contains only Dirt, so the entrance
  // and apron tiles can all be stamped without overwriting a structure
  // or running off the playable surface.
  for (let dy = -2; dy <= 2; dy++) {
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
  // RP-69a — the entrance is a 1×3 vertical strip (three WhineEntrance
  // tiles stacked N-S, centered on the chosen position). The 3×5
  // apron footprint wraps the strip, matching the cave/ruin/house
  // entrance idiom — eight neighbors of the center entrance plus the
  // two extra outer-corner cells past the strip's ends. The walk
  // mirrors the original east-band ring; the first candidate whose
  // 3×5 footprint is clear Dirt wins.
  for (const distance of WHINE_PLACEMENT_DISTANCES) {
    for (const dy of WHINE_PLACEMENT_DY_OFFSETS) {
      const cx = houseEntrance.x + distance
      const cy = houseEntrance.y + dy
      if (isPlacementCandidate(map, mapWidth, mapHeight, cx, cy)) {
        // First pass: stamp the 3×5 apron footprint. The 3 entrance
        // tiles will overwrite the center column of the apron in the
        // second pass, leaving 12 apron cells around them.
        for (let ddy = -2; ddy <= 2; ddy++) {
          for (let ddx = -1; ddx <= 1; ddx++) {
            map[cy + ddy][cx + ddx] = { type: TileType.WhineApron }
          }
        }
        // Second pass: stamp the 1×3 vertical WhineEntrance strip
        // centered on (cx, cy).
        for (let ddy = -1; ddy <= 1; ddy++) {
          map[cy + ddy][cx] = { type: TileType.WhineEntrance }
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

// Module-load registrations. Mirrors yard.ts at the bottom — registering
// at module scope means consumers just need to import this file (state.ts
// already does) for the handlers to be hooked up. RP-69a — no
// 'whine-home' swap handlers since the per-home yards were removed.
registerZoneSwapHandler('whine', 'enter', (state, transition) => {
  enterWhineVillage(state, transition.irisCenter)
})
registerZoneSwapHandler('whine', 'exit', state => {
  exitWhineVillageToOverworld(state)
})
