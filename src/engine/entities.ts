import { CHAIN_EXPLOSION_CHANCE, spawnChainMeteorites } from './celestial'
import { BEE_STARVATION_MS, BEE_TICK_MS, GHOST_TICK_MS } from './constants'
import { ComponentType } from './ecs/types'
import { AURA_RADIUS, spawnPickupBloom } from './effects'
import { tickCreatureHunger } from './hunger'
import { findFitPosition, findItemByDefinition, getActiveContainers, placeItem, removeItem } from './inventory'
import { recordDiscovery } from './manual'
import { spawnBeeOrMonarch } from './monarch'
import { getBlockedPositions } from './movement'
import { CARDINAL, isInBounds, isWalkableTile, ORDINAL, posKey } from './position'
import { TileType, Zone } from './types'
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
// entities at those tiles whose EntityTag matches `tag`. Used for all
// player pickup checks (ground items, bees, meteorites) so the hitbox
// is uniform.
const scanTagged3x3 = (state: GameState, cx: number, cy: number, tag: string): Entity[] => {
  const result: Entity[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const eid of state.world.spatial.at(cx + dx, cy + dy)) {
        if (state.world.getComponent(eid, ComponentType.EntityTag) === tag) {
          result.push(eid)
        }
      }
    }
  }
  return result
}

export const pickUpGroundItems = (state: GameState, time?: number): PickUpResult => {
  const px = state.player.x
  const py = state.player.y
  const pickedUp: string[] = []

  // All three pickup checks share a 3x3 Chebyshev footprint centered on the player.
  for (const eid of scanTagged3x3(state, px, py, 'groundItem')) {
    const itemDrop = state.world.getComponent(eid, ComponentType.ItemDrop)
    if (!itemDrop) continue
    const fit = findFitPosition(state.backpack, itemDrop.definitionId)
    if (fit) {
      const placed = placeItem(state.backpack, itemDrop.definitionId, fit.gridX, fit.gridY)
      if (placed && itemDrop.definitionId === 'coin' && itemDrop.glinting !== false) {
        state.glintingCoins.add(placed.uid)
      }
      recordDiscovery(state, `item:${itemDrop.definitionId}`)
      pickedUp.push(itemDrop.definitionId)
      state.world.destroyEntity(eid)
    }
  }

  for (const eid of scanTagged3x3(state, px, py, 'bee')) {
    const fit = findFitPosition(state.backpack, 'bee')
    if (fit) {
      placeItem(state.backpack, 'bee', fit.gridX, fit.gridY)
      state.world.destroyEntity(eid)
      recordDiscovery(state, 'item:bee')
      pickedUp.push('bee')
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

const isBeeNearFood = (state: GameState, pos: Position): boolean => {
  // Check the bee's own tile
  if (isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight) && state.map[pos.y][pos.x].type === TileType.Flora)
    return true
  // Check cardinal neighbors
  for (const d of CARDINAL) {
    const nx = pos.x + d.x
    const ny = pos.y + d.y
    if (isInBounds(nx, ny, state.mapWidth, state.mapHeight) && state.map[ny][nx].type === TileType.Flora) return true
  }
  return false
}

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

    // Collect neighboring clover tiles
    const cloverCandidates: Position[] = []
    const walkableCandidates: Position[] = []
    for (const d of ORDINAL) {
      const nx = pos.x + d.x
      const ny = pos.y + d.y
      if (isInBounds(nx, ny, state.mapWidth, state.mapHeight)) {
        const tile = state.map[ny][nx]
        if (tile.type === TileType.Flora) {
          cloverCandidates.push({ x: nx, y: ny })
        } else if (isWalkableTile(tile.type)) {
          walkableCandidates.push({ x: nx, y: ny })
        }
      }
    }

    // Prefer clover, otherwise wander randomly on walkable tiles
    const candidates = cloverCandidates.length > 0 ? cloverCandidates : walkableCandidates
    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)]
      state.world.moveEntity(eid, target.x, target.y, BEE_TICK_MS)
    }
  }

  const deaths = tickCreatureHunger(state, 'bee', BEE_STARVATION_MS, BEE_TICK_MS, isBeeNearFood)
  return deaths
}

const tickDrift = (
  state: GameState,
  eid: Entity,
  definitionId: string,
  behavior: DriftBehavior,
  blocked: Set<string>
): void => {
  if (behavior.freezeOnDialog && state.activeDialog?.characterId === definitionId) return
  if (Math.random() > behavior.moveChance) return

  const pos = state.world.getComponent(eid, ComponentType.Position)
  if (!pos) return

  // Remove self from blocked set so we don't self-block
  const selfKey = posKey(pos.x, pos.y)
  blocked.delete(selfKey)

  const candidates: Position[] = []
  for (const d of ORDINAL) {
    const nx = pos.x + d.x
    const ny = pos.y + d.y
    if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
    if (!isWalkableTile(state.map[ny][nx].type)) continue
    if (state.craters.has(posKey(nx, ny))) continue
    if (blocked.has(posKey(nx, ny))) continue
    candidates.push({ x: nx, y: ny })
  }

  if (candidates.length > 0) {
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    blocked.add(posKey(target.x, target.y))
    state.world.moveEntity(eid, target.x, target.y, GHOST_TICK_MS)
  } else {
    // Re-add self to blocked set since we didn't move
    blocked.add(selfKey)
  }
}

export const tickCharacterBehaviors = (state: GameState, zone?: Zone): void => {
  const z = zone ?? state.currentZone
  if (state.deepTime?.active) return
  const blocked = getBlockedPositions(state, z)
  blocked.add(posKey(state.player.x, state.player.y))

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
      tickDrift(state, eid, identity.definitionId, behavior, blocked)
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

export const dropItem = (state: GameState, definitionId: string): boolean => {
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
      }
      return true
    }
  }

  return false
}
