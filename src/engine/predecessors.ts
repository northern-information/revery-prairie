// RP-24 — seeded predecessor cameras.
//
// `seedPredecessorCameras(state)` is called from genesis immediately
// after `seedTenureStartFieldCamera`. It rolls a count N from the
// genesis seed, then deterministically places N cameras on walkable
// overworld tiles. Each placement records:
//   - state.placedCameras    — PlacedCamera with `predecessor`
//   - state.cameraFilm       — 0 for memorial, [4..20] for gift
//   - state.cameraArchive    — pre-developed TimeLapseFrame[]
//   - state.world            — one entity (Position, EntityTag,
//                              EntityZone, ItemDrop) per placement
//
// All rolls hash on `genesisSeed = nameToSeed(state.stewardName)` so
// the same prairie always seeds the same predecessors. Tile placements
// are filtered to walkable overworld tiles outside oak bodies, other
// placedCameras, and groundItems, at Chebyshev distance ≥
// PREDECESSOR_PLACEMENT_SPACING from earlier placements in this pass.
// Pool exhaustion is silent — partial seeding is preferred over a
// genesis crash. _The prairie keeps what it can hold._

import {
  PREDECESSOR_COUNT_MAX,
  PREDECESSOR_COUNT_MIN,
  PREDECESSOR_FATE_FIELD_PROBABILITY,
  PREDECESSOR_GIFT_FILM_MAX,
  PREDECESSOR_GIFT_FILM_MIN,
  PREDECESSOR_GIFT_PROBABILITY,
  PREDECESSOR_PLACEMENT_SPACING,
  SEASONAL_PHASE_PERIOD_MS,
} from './constants'
import { sha256Sync } from './crypto'
import { ComponentType } from './ecs/types'
import { nameToSeed } from './genesis/shared'
import { isInBounds, isWalkableTile, posKey } from './position'
import { generatePredecessorFootage } from './predecessors/footage'
import { generatePredecessorName } from './predecessors/names'
import { Zone } from './types'
import { getWorldForZone } from './zone'

import type { GameState, PlacedCamera, Position, PredecessorFate, PredecessorRecord } from './types'

const hashTo32 = (message: string): number => parseInt(sha256Sync(message).slice(0, 8), 16) >>> 0
const rollUnit = (message: string): number => hashTo32(message) / 0x100000000

const cheby = (a: Position, b: Position): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

const derivePredecessorCount = (genesisSeed: number): number => {
  const h = hashTo32(`predecessors:count:${String(genesisSeed)}`)
  const span = PREDECESSOR_COUNT_MAX - PREDECESSOR_COUNT_MIN + 1
  return PREDECESSOR_COUNT_MIN + (h % span)
}

// Collect every overworld tile that is (a) in-bounds, (b) walkable,
// (c) not inside an oak body, (d) not occupied by a placedCamera, and
// (e) not occupied by a groundItem. The result is a candidate pool for
// hash-modulo selection. Tiles are returned in scan order (row-major)
// so the modulo into the pool is reproducible.
const collectCandidatePool = (state: GameState): Position[] => {
  const reserved = new Set<string>()

  // Oak bodies (MultiPosition).
  for (const eid of state.world.query(ComponentType.OakData, ComponentType.MultiPosition)) {
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    if (!multi) continue
    for (const p of multi.positions) reserved.add(posKey(p.x, p.y))
  }

  // Existing placedCamera entities (including the inherited Field
  // Camera seeded earlier in genesis).
  for (const camera of state.placedCameras) {
    if (camera.zone === Zone.Overworld) reserved.add(posKey(camera.x, camera.y))
  }

  // Ground items (precaution — RP-24 runs late in genesis, before any
  // gameplay drops, but the spec requires the filter explicitly).
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'groundItem') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos) reserved.add(posKey(pos.x, pos.y))
  }

  const candidates: Position[] = []
  for (let y = 0; y < state.overworldMapHeight; y++) {
    for (let x = 0; x < state.overworldMapWidth; x++) {
      if (!isInBounds(x, y, state.overworldMapWidth, state.overworldMapHeight)) continue
      if (reserved.has(posKey(x, y))) continue
      if (!isWalkableTile(state.overworldMap[y][x].type)) continue
      candidates.push({ x, y })
    }
  }
  return candidates
}

// Pick a tile from the candidate pool that respects the spacing
// constraint against already-chosen placements. Returns null when no
// candidate survives the filter — caller treats this as pool exhaustion.
const pickPlacementTile = (
  candidates: Position[],
  alreadyChosen: Position[],
  hashMessage: string
): Position | null => {
  const filtered = candidates.filter(c => alreadyChosen.every(p => cheby(c, p) >= PREDECESSOR_PLACEMENT_SPACING))
  if (filtered.length === 0) return null
  const idx = hashTo32(hashMessage) % filtered.length
  return filtered[idx]
}

// Pick a fate tile (walkable + in-bounds, no spacing requirement) from
// the overworld map. Used when the predecessor died on the field
// rather than at the bed.
const pickFateTile = (state: GameState, hashMessage: string): Position | null => {
  const candidates: Position[] = []
  for (let y = 0; y < state.overworldMapHeight; y++) {
    for (let x = 0; x < state.overworldMapWidth; x++) {
      if (!isWalkableTile(state.overworldMap[y][x].type)) continue
      candidates.push({ x, y })
    }
  }
  if (candidates.length === 0) return null
  const idx = hashTo32(hashMessage) % candidates.length
  return candidates[idx]
}

const deriveFate = (state: GameState, genesisSeed: number, index: number): PredecessorFate => {
  const r = rollUnit(`predecessors:${String(genesisSeed)}:fate:${String(index)}`)
  if (r >= PREDECESSOR_FATE_FIELD_PROBABILITY) return 'bed'
  const tile = pickFateTile(state, `predecessors:${String(genesisSeed)}:fate:${String(index)}:tile`)
  if (!tile) return 'bed'
  return { kind: 'field', tile }
}

interface GiftRoll {
  filmRemaining: number
}

const deriveGiftRoll = (genesisSeed: number, index: number): GiftRoll => {
  const message = `predecessors:${String(genesisSeed)}:gift:${String(index)}`
  const r = rollUnit(message)
  if (r >= PREDECESSOR_GIFT_PROBABILITY) return { filmRemaining: 0 }
  const filmSpan = PREDECESSOR_GIFT_FILM_MAX - PREDECESSOR_GIFT_FILM_MIN + 1
  const filmRemaining = PREDECESSOR_GIFT_FILM_MIN + (hashTo32(`${message}:film`) % filmSpan)
  return { filmRemaining }
}

export const seedPredecessorCameras = (state: GameState): void => {
  const genesisSeed = nameToSeed(state.stewardName)
  const targetCount = derivePredecessorCount(genesisSeed)
  const candidates = collectCandidatePool(state)
  if (candidates.length === 0) return

  const chosen: Position[] = []
  for (let i = 0; i < targetCount; i++) {
    const tile = pickPlacementTile(
      candidates,
      chosen,
      `predecessors:${String(genesisSeed)}:place:${String(i)}`
    )
    if (!tile) return // pool exhausted; partial seeding accepted

    chosen.push(tile)

    const stewardName = generatePredecessorName(genesisSeed, i)
    const fate = deriveFate(state, genesisSeed, i)
    const tenure = i + 1
    const predecessor: PredecessorRecord = { stewardName, tenure, fate }

    const gift = deriveGiftRoll(genesisSeed, i)
    const cameraUid = crypto.randomUUID()
    state.cameraFilm.set(cameraUid, gift.filmRemaining)

    const frames = generatePredecessorFootage(genesisSeed, i)
    state.cameraArchive.set(cameraUid, frames)

    const placed: PlacedCamera = {
      uid: cameraUid,
      x: tile.x,
      y: tile.y,
      zone: Zone.Overworld,
      startedAt: 0,
      expiresAt: gift.filmRemaining > 0 ? SEASONAL_PHASE_PERIOD_MS / 4 : 0,
      frames: [],
      predecessor,
    }
    state.placedCameras.push(placed)

    // Predecessor cameras are always overworld-placed today. Route
    // explicitly so the call site doesn't break the day a non-overworld
    // predecessor placement is added.
    const overworldWorld = getWorldForZone(state, Zone.Overworld)
    const ce = overworldWorld.createEntity()
    overworldWorld.addComponent(ce, ComponentType.Position, { x: tile.x, y: tile.y })
    overworldWorld.addComponent(ce, ComponentType.EntityTag, 'placedCamera')
    overworldWorld.addComponent(ce, ComponentType.EntityZone, { zone: Zone.Overworld })
    overworldWorld.addComponent(ce, ComponentType.ItemDrop, { definitionId: 'camera' })
  }
}
