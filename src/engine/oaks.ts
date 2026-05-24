import { SPACE_BORDER } from './constants'
import { sha256Sync } from './crypto'
import { ComponentType } from './ecs/types'
import { generateTraitBag } from './genetics'
import { isInBounds, isReservedForStructure, isWalkableTile, posKey } from './position'
import { Season, TileType, Zone } from './types'

import type { GameState, Position } from './types'

// 5x5 logical footprint. In iso projection this is a tall diamond — the
// extra rows give the canopy room to sit visually above the trunk. The
// trunk occupies the bottom-most iso rows; the rest is canopy.
export const OAK_BODY_SIZE = 5
const OAK_HALF = Math.floor(OAK_BODY_SIZE / 2)

// Species metadata — first oak species in the game is the White Oak
// (Quercus alba). Mirrors the structure used by flora species: displayName
// for prose / sidebar labels, latinBinomial for the manual specimen card.
export const OAK_SPECIES = {
  displayName: 'White Oak',
  latinBinomial: 'Quercus alba',
} as const

// Trunk + bark
const TRUNK_DARK = '#4A2E18'
const TRUNK_MID = '#6B4423'
// Canopy summer
const CANOPY_MID = '#5A7A3A'
// Canopy winter — bare branches against muted browns
const DORMANT_DARK = '#5A4530'
const DORMANT_MID = '#7A5A3A'

export interface OakTileLayer {
  char: string
  color: string
  dx: number
  dy: number
}

// Returns the 9 tiles (centre = trunk at anchor; dx,dy ∈ [-1, 1]).
export const getOakBodyPositions = (anchorX: number, anchorY: number): Position[] => {
  const positions: Position[] = []
  for (let dy = -OAK_HALF; dy <= OAK_HALF; dy++) {
    for (let dx = -OAK_HALF; dx <= OAK_HALF; dx++) {
      positions.push({ x: anchorX + dx, y: anchorY + dy })
    }
  }
  return positions
}

const isWaterTile = (state: GameState, x: number, y: number): boolean => {
  const key = posKey(x, y)
  return state.ponds.has(key) || state.rivers.has(key)
}

const isOakOccupied = (state: GameState, x: number, y: number): boolean => {
  for (const eid of state.world.query(ComponentType.OakData, ComponentType.MultiPosition)) {
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    if (!multi) continue
    for (const p of multi.positions) {
      if (p.x === x && p.y === y) return true
    }
  }
  return false
}

export const isValidOakPosition = (state: GameState, anchorX: number, anchorY: number): boolean => {
  // Oaks live on the overworld map only. state.map may point at the
  // cave or house interior at the moment of validation (RP-33).
  const overworld = state.overworldMap
  for (let dy = -OAK_HALF; dy <= OAK_HALF; dy++) {
    for (let dx = -OAK_HALF; dx <= OAK_HALF; dx++) {
      const x = anchorX + dx
      const y = anchorY + dy
      if (!isInBounds(x, y, state.overworldMapWidth, state.overworldMapHeight)) return false
      const tile = overworld[y][x].type
      if (!isWalkableTile(tile)) return false
      if (tile === TileType.Sand) return false
      if (isReservedForStructure(tile)) return false
      if (isWaterTile(state, x, y)) return false
      if (isOakOccupied(state, x, y)) return false
    }
  }
  return true
}

export const generateOakIdentity = (stewardName: string, anchorX: number, anchorY: number): string =>
  sha256Sync(`${stewardName}:oak:${String(anchorX)},${String(anchorY)}`).toUpperCase()

// Spawns an oak entity centred at (anchorX, anchorY). Caller must have already
// validated the position via isValidOakPosition. Returns the new entity id.
export const spawnOak = (state: GameState, anchorX: number, anchorY: number, time: number): number => {
  const eid = state.world.createEntity()
  state.world.addComponent(eid, ComponentType.Position, { x: anchorX, y: anchorY })
  state.world.addComponent(eid, ComponentType.MultiPosition, {
    positions: getOakBodyPositions(anchorX, anchorY),
  })
  const identity = generateOakIdentity(state.stewardName, anchorX, anchorY)
  state.world.addComponent(eid, ComponentType.OakData, {
    plantedTime: time,
    identity,
    traits: generateTraitBag(identity),
  })
  state.world.addComponent(eid, ComponentType.EntityTag, 'oak')
  state.world.addComponent(eid, ComponentType.EntityZone, { zone: Zone.Overworld })
  return eid
}

// Iso projection: px = (x - y) * w, py = (x + y) * h/2. So a 5x5 logical
// footprint becomes a tall diamond on screen, with the screen-vertical axis
// running along (dx + dy). The diamond has 9 iso rows (isoRow in [-4, +4]).
//
// Role by iso row:
//   isoRow <= -1   → canopy mass (leaves)
//   isoRow == 0    → canopy / trunk shoulder (widest row of the diamond)
//   isoRow == 1    → upper trunk + low canopy flanks
//   isoRow >= 2    → trunk (visible bark, no foliage leakage)
//
// Single bold glyph per tile — no sub-pixel overlays. The user reported the
// previous overlay-heavy approach read as a pile of sticks; this version
// trusts the iso silhouette to do the work.
export const getOakRenderTile = (
  dx: number,
  dy: number,
  isDormant: boolean
): { char: string; color: string } => {
  const isoRow = dx + dy
  const isoCol = dx - dy

  // Trunk tiles — the bottom-vertex of the diamond and the two flanking tiles
  // immediately above it. Clean wood glyphs, no foliage.
  if (isoRow >= 3) {
    // Very bottom — heavy trunk base
    return { char: '|', color: TRUNK_DARK }
  }
  if (isoRow === 2) {
    // Trunk middle — solid vertical
    if (isoCol === 0) return { char: '|', color: TRUNK_MID }
    return { char: isoCol < 0 ? '/' : '\\', color: TRUNK_MID }
  }

  // Crown apex — single tile at the top of the diamond
  if (isoRow === -4) {
    return {
      char: isDormant ? '`' : '&',
      color: isDormant ? DORMANT_MID : CANOPY_MID,
    }
  }

  // Canopy rows. The denser leaf chars cluster around the central column;
  // the diamond's outer edges get lighter chars so the silhouette has a
  // soft outline.
  const isCentre = Math.abs(isoCol) <= 1
  const isEdge = Math.abs(isoCol) >= Math.abs(isoRow) - 1 && Math.abs(isoRow) <= 3

  if (isDormant) {
    // Winter — bare branches, Y-forks at the dense centres
    if (isCentre) return { char: 'Y', color: DORMANT_DARK }
    if (isEdge) return { char: '`', color: DORMANT_MID }
    return { char: '+', color: DORMANT_MID }
  }

  // Summer — packed canopy
  if (isCentre) return { char: '&', color: CANOPY_MID }
  if (isEdge) return { char: '&', color: CANOPY_MID }
  return { char: '#', color: CANOPY_MID }
}

// Multilayer overlays are currently disabled — a single bold base glyph per
// tile reads more clearly as a tree silhouette than stacked sub-pixel chars,
// which devolved into a "pile of sticks" texture at this scale. Kept as a
// stub so the renderer's deferred-flush path doesn't need a branch; returns
// an empty array on every call. Re-enable by populating layers if/when the
// silhouette is settled and texture is desired.
export const getOakTileLayers = (
  _anchorX: number,
  _anchorY: number,
  _dx: number,
  _dy: number,
  _isDormant: boolean
): OakTileLayer[] => []

export const isOakDormant = (state: GameState): boolean => state.weather.season === Season.Winter

// Seeded during genesis handoff. Scatters a handful of oaks across the
// overworld at deterministically-random positions. Each oak placement is
// validated; positions failing isValidOakPosition are skipped.
const OAK_GENESIS_COUNT = 8
const OAK_GENESIS_ATTEMPTS_MAX = 500
// Minimum chebyshev distance between oak trunks. Keeps adjacent oaks from
// overlapping (each footprint reaches OAK_HALF tiles from its anchor) while
// still leaving walkable corridors between neighbouring trees.
const OAK_MIN_SPACING = OAK_BODY_SIZE + 2
// Minimum distance between an oak anchor and the player spawn / Gron. The
// footprint extends OAK_HALF tiles from the anchor; the clearance buffer
// keeps player spawn and the central NPC tile reachable on day one.
const OAK_PLAYER_CLEARANCE = OAK_HALF + 3

const tooCloseToExistingOak = (state: GameState, x: number, y: number): boolean => {
  for (const eid of state.world.query(ComponentType.OakData, ComponentType.Position)) {
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    if (Math.max(Math.abs(pos.x - x), Math.abs(pos.y - y)) < OAK_MIN_SPACING) return true
  }
  return false
}

// Returns true when the candidate oak anchor is too close to Gron (the
// central character) or to the house entrance. The footprint extends ±1
// around the anchor, so the clearance is checked against that extended
// bound. RP-33 — the player spawns inside the house at tenure
// start; the overworld anchor we clear around is the house entrance,
// not state.player.
const tooCloseToHouseOrGron = (state: GameState, x: number, y: number): boolean => {
  const pdx = Math.abs(x - state.houseEntranceOverworld.x)
  const pdy = Math.abs(y - state.houseEntranceOverworld.y)
  if (Math.max(pdx, pdy) < OAK_PLAYER_CLEARANCE) return true
  // Gron lives at the centre tile of the overworld map.
  const gronX = Math.floor(state.overworldMapWidth / 2)
  const gronY = Math.floor(state.overworldMapHeight / 2)
  const gdx = Math.abs(x - gronX)
  const gdy = Math.abs(y - gronY)
  if (Math.max(gdx, gdy) < OAK_PLAYER_CLEARANCE) return true
  return false
}

export const seedOaks = (state: GameState, time: number): number => {
  let placed = 0
  let attempts = 0
  // Anchor must be at least OAK_HALF tiles from any edge so the footprint
  // stays inside the playable area (avoids isValidOakPosition rejecting on
  // out-of-bounds and wasting attempts). Always seed on the overworld
  // map (state.map may point at the house interior at genesis-handoff
  // time when called from finalizeGenesisHandoff).
  const xMin = SPACE_BORDER + OAK_HALF
  const xMax = state.overworldMapWidth - SPACE_BORDER - OAK_HALF - 1
  const yMin = SPACE_BORDER + OAK_HALF
  const yMax = state.overworldMapHeight - SPACE_BORDER - OAK_HALF - 1
  while (placed < OAK_GENESIS_COUNT && attempts < OAK_GENESIS_ATTEMPTS_MAX) {
    attempts++
    const x = xMin + Math.floor(Math.random() * (xMax - xMin + 1))
    const y = yMin + Math.floor(Math.random() * (yMax - yMin + 1))
    if (tooCloseToHouseOrGron(state, x, y)) continue
    if (tooCloseToExistingOak(state, x, y)) continue
    if (!isValidOakPosition(state, x, y)) continue
    spawnOak(state, x, y, time)
    placed++
  }
  return placed
}
