import { CHAIN_EXPLOSION_CHANCE, spawnChainMeteorites } from './celestial'
import { BEE_STARVATION_MS, BEE_TICK_MS, GHOST_TICK_MS } from './constants'
import { ComponentType } from './ecs/types'
import { AURA_RADIUS, spawnPickupBloom } from './effects'
import { FLORA_SPECIES, getTileBeePreference } from './flora/species'
import { createFloraLifecycleEntry } from './floraLifecycleEntry'
import { tickCreatureHunger } from './hunger'
import { findFitPosition, findItemByDefinition, getActiveContainers, placeItem, removeItem } from './inventory'
import { setMapTile } from './map'
import { recordDiscovery } from './manual'
import { spawnBeeOrMonarch } from './monarch'
import { CARDINAL, isInBounds, isWalkableTile, ORDINAL, posKey } from './position'
import { FloraSpecies, TileType, Zone } from './types'
import { getCurrentEntityZone, isEntityInCurrentZone, spatialAtInCurrentZone } from './zone'

import type { Entity } from './ecs/types'
import type { CharacterBehavior, DriftBehavior, GameState, Position } from './types'

export const createCharacterEntity = (
  state: GameState,
  definitionId: string,
  pos: Position,
  opts?: { aura?: string; behavior?: CharacterBehavior; zone?: Zone; ruinIndex?: number }
): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x: pos.x, y: pos.y })
  state.world.addComponent(e, ComponentType.CharacterIdentity, { definitionId })
  state.world.addComponent(e, ComponentType.Blocking, { blockMovement: true })
  state.world.addComponent(e, ComponentType.EntityTag, 'character')
  const entityZone =
    opts?.zone !== undefined ? { zone: opts.zone, ruinIndex: opts.ruinIndex } : getCurrentEntityZone(state)
  state.world.addComponent(e, ComponentType.EntityZone, entityZone)
  if (opts?.aura) {
    const radius = AURA_RADIUS[opts.aura] ?? 6
    state.world.addComponent(e, ComponentType.Aura, { kind: opts.aura, radius })
  }
  if (opts?.behavior) {
    state.world.addComponent(e, ComponentType.Behavior, opts.behavior)
  }
  return e
}

export interface PickUpResult {
  pickedUp: string[]
  chainExplosions: number
  disintegrations: number
}

// Scan the 3x3 Chebyshev footprint centered on (cx, cy) and return all
// entities at those tiles whose EntityTag matches `tag` AND that belong to
// the player's current zone. Used for player pickup checks (ground items,
// meteorites) so the hitbox is uniform and cross-zone entities (e.g. a
// ruin-tagged aqueduct key sitting at the same coordinates as the player
// in the overworld) are not picked up. See harness/specs/pickup-zone-
// filter.yaml for the contract. Live bees are intentionally not captured
// by walk-over — see the bee branch removal note inside pickUpGroundItems.
const scanTagged3x3 = (state: GameState, cx: number, cy: number, tag: string): Entity[] => {
  const result: Entity[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const eid of state.world.spatial.at(cx + dx, cy + dy)) {
        if (state.world.getComponent(eid, ComponentType.EntityTag) !== tag) continue
        if (!isEntityInCurrentZone(state, eid)) continue
        result.push(eid)
      }
    }
  }
  return result
}

export const pickUpGroundItems = (state: GameState, time?: number): PickUpResult => {
  const px = state.player.x
  const py = state.player.y
  const pickedUp: string[] = []

  // Sweep stale pickup exemptions: any entity tagged PickupExemption whose
  // position is outside the player's 3x3 footprint gets its marker cleared
  // (one-shot). Entities still inside the 3x3 keep the marker so the
  // perimeter-walk case continues to suppress pickup.
  for (const eid of state.world.query(ComponentType.PickupExemption)) {
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) {
      state.world.removeComponent(eid, ComponentType.PickupExemption)
      continue
    }
    if (Math.max(Math.abs(pos.x - px), Math.abs(pos.y - py)) > 1) {
      state.world.removeComponent(eid, ComponentType.PickupExemption)
    }
  }

  // All three pickup checks share a 3x3 Chebyshev footprint centered on the player.
  for (const eid of scanTagged3x3(state, px, py, 'groundItem')) {
    if (state.world.hasComponent(eid, ComponentType.PickupExemption)) continue
    const itemDrop = state.world.getComponent(eid, ComponentType.ItemDrop)
    if (!itemDrop) continue
    const fit = findFitPosition(state.backpack, itemDrop.definitionId)
    if (fit) {
      const placed = placeItem(state.backpack, itemDrop.definitionId, fit.gridX, fit.gridY)
      if (placed && itemDrop.definitionId === 'coin' && itemDrop.glinting !== false) {
        state.glintingCoins.add(placed.uid)
      }
      // Precis #11 — genetics-bearing seeds carry a FloraGenome on the
      // ItemDrop component. Transfer it to the uid-keyed side-table at
      // pickup so the inventory layer stays flat (mirrors glintingCoins).
      if (placed && itemDrop.genome) {
        state.seedGenomes.set(placed.uid, itemDrop.genome)
      }
      recordDiscovery(state, `item:${itemDrop.definitionId}`)
      pickedUp.push(itemDrop.definitionId)
      state.world.destroyEntity(eid)
    }
  }

  // Snapshot meteorite candidates BEFORE the chain phase mutates the world.
  // The pickup phase iterates this snapshot so chain-spawned meteorites that
  // happen to land within the player's 3x3 footprint are not captured on the
  // same tick — they must be picked up on a later tick, matching the prior
  // single-tile semantic where chain spawns landed outside the pickup tile.
  const meteoriteCandidates = scanTagged3x3(state, px, py, 'meteorite')

  // Unstable meteorite: 1-in-7 roll flags as unstable, then an
  // independent 50/50 sub-roll picks explode vs disintegrate.
  // On either outcome the original meteorite is consumed
  // (removed, not picked up). Chain center is the meteorite's
  // own tile, not the player's.
  let chainExplosions = 0
  let disintegrations = 0
  if (time !== undefined) {
    for (const eid of meteoriteCandidates) {
      const chain = state.world.getComponent(eid, ComponentType.ChainSource)
      if (chain?.fromChain) continue
      if (Math.random() >= CHAIN_EXPLOSION_CHANCE) continue
      const mpos = state.world.getComponent(eid, ComponentType.Position)
      if (!mpos) continue
      const center = { x: mpos.x, y: mpos.y }
      state.world.destroyEntity(eid)
      if (Math.random() < 0.5) {
        chainExplosions += spawnChainMeteorites(state, center, time)
      } else {
        disintegrations += 1
      }
    }
  }

  for (const eid of meteoriteCandidates) {
    // Skip entities the chain phase already destroyed.
    if (state.world.getComponent(eid, ComponentType.Position) === undefined) continue
    const fit = findFitPosition(state.backpack, 'meteorite')
    if (fit) {
      placeItem(state.backpack, 'meteorite', fit.gridX, fit.gridY)
      state.world.destroyEntity(eid)
      recordDiscovery(state, 'item:meteorite')
      pickedUp.push('meteorite')
    }
  }

  if (pickedUp.length > 0 && time !== undefined) {
    spawnPickupBloom(state, px, py, time)
  }

  return { pickedUp, chainExplosions, disintegrations }
}

// Precis #7 — bee food is any Flora tile whose species has nonzero
// beePreference. Clover historically was the only food; wildflower and tall
// grass now also count.
const isFloraFoodAt = (state: GameState, x: number, y: number): boolean => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return false
  if (state.map[y][x].type !== TileType.Flora) return false
  const entry = state.floraLifecycle.get(posKey(x, y))
  if (!entry) return false
  return FLORA_SPECIES[entry.species].beePreference > 0
}

const isBeeNearFood = (state: GameState, pos: Position): boolean => {
  if (isFloraFoodAt(state, pos.x, pos.y)) return true
  for (const d of CARDINAL) {
    if (isFloraFoodAt(state, pos.x + d.x, pos.y + d.y)) return true
  }
  return false
}

// Precis #7 — non-Flora walkable tiles still receive a small baseline weight
// so bees wander even when no flora is adjacent. Tuned to keep clover (1.0)
// roughly 20× more attractive than bare dirt; wildflower (0.6) ~12×.
const WANDER_BASELINE_WEIGHT = 0.05

export const tickBees = (state: GameState, zone?: Zone): Position[] => {
  const z = zone ?? state.currentZone
  const matchesZone = (eid: number): boolean =>
    z === state.currentZone
      ? isEntityInCurrentZone(state, eid)
      : state.world.getComponent(eid, ComponentType.EntityZone)?.zone === z
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'bee') continue
    if (!matchesZone(eid)) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue

    // Only move sometimes — gives a lazy, buzzing feel
    if (Math.random() > 0.3) continue

    // Precis #7 — weighted neighbor pick. Each walkable neighbor gets a
    // weight: Flora tiles use getTileBeePreference (species baseline ×
    // per-plant trait, clamped to [0, 1]); non-Flora walkable tiles use a
    // small baseline so bees still wander. Cumulative-weight selection.
    const candidates: { pos: Position; weight: number }[] = []
    let totalWeight = 0
    for (const d of ORDINAL) {
      const nx = pos.x + d.x
      const ny = pos.y + d.y
      if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
      const tile = state.map[ny][nx]
      if (!isWalkableTile(tile.type)) continue
      const preference = getTileBeePreference(state, nx, ny)
      const weight = preference > 0 ? preference : WANDER_BASELINE_WEIGHT
      candidates.push({ pos: { x: nx, y: ny }, weight })
      totalWeight += weight
    }

    if (totalWeight === 0) continue

    const roll = Math.random() * totalWeight
    let cumulative = 0
    for (const c of candidates) {
      cumulative += c.weight
      if (roll < cumulative) {
        state.world.moveEntity(eid, c.pos.x, c.pos.y, BEE_TICK_MS)
        break
      }
    }
  }

  const deaths = tickCreatureHunger(state, 'bee', BEE_STARVATION_MS, BEE_TICK_MS, isBeeNearFood)
  return deaths
}

// Ghosts are non-corporeal — drift only checks terrain walkability and
// craters. Entity blockers (oaks, angels, other ghosts, characters, the
// player) are intentionally ignored so a ghost enclosed by an oak canopy
// or surrounded by other entities can still drift out.
const tickDrift = (state: GameState, eid: Entity, definitionId: string, behavior: DriftBehavior): void => {
  if (behavior.freezeOnDialog && state.activeDialog?.characterId === definitionId) return
  if (Math.random() > behavior.moveChance) return

  const pos = state.world.getComponent(eid, ComponentType.Position)
  if (!pos) return

  const candidates: Position[] = []
  for (const d of ORDINAL) {
    const nx = pos.x + d.x
    const ny = pos.y + d.y
    if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
    if (!isWalkableTile(state.map[ny][nx].type)) continue
    if (state.craters.has(posKey(nx, ny))) continue
    candidates.push({ x: nx, y: ny })
  }

  if (candidates.length > 0) {
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    state.world.moveEntity(eid, target.x, target.y, GHOST_TICK_MS)
  }
}

export const tickCharacterBehaviors = (state: GameState, zone?: Zone): void => {
  const z = zone ?? state.currentZone
  if (state.deepTime?.active) return

  const matchesZone = (eid: number): boolean =>
    z === state.currentZone
      ? isEntityInCurrentZone(state, eid)
      : state.world.getComponent(eid, ComponentType.EntityZone)?.zone === z
  for (const eid of state.world.query(
    ComponentType.Behavior,
    ComponentType.CharacterIdentity,
    ComponentType.Position
  )) {
    if (!matchesZone(eid)) continue
    const behavior = state.world.getComponent(eid, ComponentType.Behavior)
    if (!behavior) continue
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (!identity) continue

    if (behavior.type === 'drift') {
      tickDrift(state, eid, identity.definitionId, behavior)
    }
  }
}

// Drop order: N, NE, E, SE, S, SW, W, NW, then under the player
const DROP_DELTAS: Position[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: 0 },
]

const canDropAt = (state: GameState, x: number, y: number): boolean => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return false
  if (!isWalkableTile(state.map[y][x].type)) return false
  if (
    spatialAtInCurrentZone(state, x, y).some(eid => {
      const tag = state.world.getComponent(eid, ComponentType.EntityTag)
      return tag === 'groundItem'
    })
  )
    return false
  return true
}

// Precis #11 — seed items plant into Dirt rather than dropping as ground
// items. The mapping is definitionId → FloraSpecies. milkweedSeeds remains
// absent (no FloraSpecies entry) so it is not listed here.
const SEED_TO_SPECIES: Record<string, FloraSpecies> = {
  wildflowerSeeds: FloraSpecies.Wildflower,
  tallGrassSeeds: FloraSpecies.TallGrass,
}

const canPlantSeedAt = (state: GameState, x: number, y: number): boolean => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return false
  if (state.map[y][x].type !== TileType.Dirt) return false
  if (
    spatialAtInCurrentZone(state, x, y).some(eid => {
      const tag = state.world.getComponent(eid, ComponentType.EntityTag)
      return tag === 'groundItem'
    })
  )
    return false
  return true
}

export const dropItem = (state: GameState, definitionId: string, time?: number): boolean => {
  // Find the item in the backpack or open container
  const containers = getActiveContainers(state)

  let sourceContainer = null
  let sourceItem = null
  for (const container of containers) {
    const item = findItemByDefinition(container, definitionId)
    if (item) {
      sourceContainer = container
      sourceItem = item
      break
    }
  }

  if (!sourceContainer || !sourceItem) return false

  // Precis #11 — seed items plant onto adjacent Dirt rather than dropping
  // as ground items. Cannot be set down as bare ground items. Aligns with
  // v4 "renewal not stockpile" cosmology — every drop either plants or
  // fails. Genome travels from state.seedGenomes (uid-keyed) to the
  // planted plant's FloraLifecycleState; the side-table entry is removed.
  const plantingSpecies = SEED_TO_SPECIES[definitionId]
  if (plantingSpecies !== undefined) {
    for (const d of DROP_DELTAS) {
      const tx = state.player.x + d.x
      const ty = state.player.y + d.y
      if (canPlantSeedAt(state, tx, ty)) {
        const seedUid = sourceItem.uid
        const genome = state.seedGenomes.get(seedUid)
        if (!genome) return false
        removeItem(sourceContainer, seedUid)
        state.seedGenomes.delete(seedUid)
        setMapTile(state, tx, ty, { type: TileType.Flora })
        state.floraLifecycle.set(
          posKey(tx, ty),
          createFloraLifecycleEntry({
            time: time ?? 0,
            hasLight: true,
            species: plantingSpecies,
            identity: genome.identity,
            traits: genome.traits,
          }),
        )
        if (time !== undefined) {
          spawnPickupBloom(state, tx, ty, time)
        }
        return true
      }
    }
    return false
  }

  // Find the first valid drop position
  for (const d of DROP_DELTAS) {
    const tx = state.player.x + d.x
    const ty = state.player.y + d.y
    if (canDropAt(state, tx, ty)) {
      const droppedUid = sourceItem.uid
      removeItem(sourceContainer, droppedUid)
      // Bees are released as world entities instead of ground items
      if (definitionId === 'bee') {
        spawnBeeOrMonarch(state, tx, ty)
      } else {
        const ge = state.world.createEntity()
        state.world.addComponent(ge, ComponentType.Position, { x: tx, y: ty })
        const dropData: { definitionId: string; glinting?: boolean } = { definitionId }
        if (definitionId === 'coin') {
          dropData.glinting = state.glintingCoins.has(droppedUid)
          state.glintingCoins.delete(droppedUid)
        }
        state.world.addComponent(ge, ComponentType.ItemDrop, dropData)
        state.world.addComponent(ge, ComponentType.EntityTag, 'groundItem')
        state.world.addComponent(ge, ComponentType.EntityZone, getCurrentEntityZone(state))
        state.world.addComponent(ge, ComponentType.PickupExemption, {})
      }
      return true
    }
  }

  return false
}
