import { CHAIN_EXPLOSION_CHANCE, spawnChainMeteorites } from './celestial'
import { ComponentType } from './ecs'
import { AURA_RADIUS } from './effects'
import { findFitPosition, findItemByDefinition, getActiveContainers, placeItem, removeItem } from './inventory'
import { getBlockedPositions } from './movement'
import { isInBounds, isWalkableTile, ORDINAL, posKey } from './position'
import { TileType } from './types'

import type { Entity } from './ecs'
import type { CharacterBehavior, DriftBehavior, GameState, Position } from './types'

export const createCharacterEntity = (
  state: GameState,
  definitionId: string,
  pos: Position,
  opts?: { aura?: string; behavior?: CharacterBehavior },
): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x: pos.x, y: pos.y })
  state.world.addComponent(e, ComponentType.CharacterIdentity, { definitionId })
  state.world.addComponent(e, ComponentType.Blocking, { blockMovement: true })
  state.world.addComponent(e, ComponentType.EntityTag, 'character')
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
}

export const pickUpGroundItems = (state: GameState, time?: number): PickUpResult => {
  const px = state.player.x
  const py = state.player.y
  const pickedUp: string[] = []

  // Ground items (ECS entities with 'groundItem' tag)
  const groundItemsAtPlayer = state.world.spatial
    .at(px, py)
    .filter((eid) => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem')
  for (const eid of groundItemsAtPlayer) {
    const itemDrop = state.world.getComponent(eid, ComponentType.ItemDrop)
    if (!itemDrop) continue
    const fit = findFitPosition(state.backpack, itemDrop.definitionId)
    if (fit) {
      placeItem(state.backpack, itemDrop.definitionId, fit.rotation, fit.gridX, fit.gridY)
      pickedUp.push(itemDrop.definitionId)
      state.world.destroyEntity(eid)
    }
  }

  const beesAtPlayer = state.world.spatial
    .at(px, py)
    .filter((eid) => state.world.getComponent(eid, ComponentType.EntityTag) === 'bee')
  for (const eid of beesAtPlayer) {
    const fit = findFitPosition(state.backpack, 'bee')
    if (fit) {
      placeItem(state.backpack, 'bee', fit.rotation, fit.gridX, fit.gridY)
      state.world.destroyEntity(eid)
      pickedUp.push('bee')
    }
  }

  // Chain explosion: roll first, then capture survivors.
  // Exploded meteorites are consumed (removed, not picked up).
  let chainExplosions = 0
  if (time !== undefined) {
    const meteoritesAtPlayer = state.world.spatial
      .at(px, py)
      .filter((eid) => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')
    for (const eid of meteoritesAtPlayer) {
      const chain = state.world.getComponent(eid, ComponentType.ChainSource)
      if (!chain?.fromChain && Math.random() < CHAIN_EXPLOSION_CHANCE) {
        state.world.destroyEntity(eid)
        chainExplosions += spawnChainMeteorites(state, { x: px, y: py }, time)
      }
    }
  }

  // Capture surviving meteorites at player position
  const remainingMeteoritesAtPlayer = state.world.spatial
    .at(px, py)
    .filter((eid) => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')
  let meteoritesCaptured = 0
  for (const eid of remainingMeteoritesAtPlayer) {
    const fit = findFitPosition(state.backpack, 'meteorite')
    if (fit) {
      placeItem(state.backpack, 'meteorite', fit.rotation, fit.gridX, fit.gridY)
      state.world.destroyEntity(eid)
      pickedUp.push('meteorite')
      meteoritesCaptured++
    }
  }

  if (meteoritesCaptured > 0 && time !== undefined) {
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: px, y: py })
    state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'pickupBloom', startTime: time })
    state.world.addComponent(e, ComponentType.EntityTag, 'pickupBloom')
  }

  // Auto-close open ground omnibox when player walks away
  if (state.openContainer) {
    const go = state.groundOmniboxes.find(g => g.uid === state.openContainer?.id)
    if (go) {
      const dx = Math.abs(go.pos.x - px)
      const dy = Math.abs(go.pos.y - py)
      if (dx > 1 || dy > 1) {
        state.openContainer = null
      }
    }
  }

  return { pickedUp, chainExplosions }
}

export const tickBees = (state: GameState): void => {
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'bee') continue
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
        if (tile.type === TileType.Clover) {
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
      state.world.moveEntity(eid, target.x, target.y)
    }
  }
}

const tickDrift = (
  state: GameState,
  eid: Entity,
  definitionId: string,
  behavior: DriftBehavior,
  blocked: Set<string>,
): void => {
  if (behavior.freezeOnDialog && state.activeDialog?.characterId === definitionId) return
  if (Math.random() > behavior.speed) return

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
    if (blocked.has(posKey(nx, ny))) continue
    candidates.push({ x: nx, y: ny })
  }

  if (candidates.length > 0) {
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    blocked.add(posKey(target.x, target.y))
    state.world.moveEntity(eid, target.x, target.y)
  } else {
    // Re-add self to blocked set since we didn't move
    blocked.add(selfKey)
  }
}

export const tickCharacterBehaviors = (state: GameState): void => {
  const blocked = getBlockedPositions(state)
  blocked.add(posKey(state.player.x, state.player.y))

  for (const eid of state.world.query(ComponentType.Behavior, ComponentType.CharacterIdentity, ComponentType.Position)) {
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
    state.world.spatial
      .at(x, y)
      .some((eid) => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem')
  )
    return false
  if (state.groundOmniboxes.some(g => g.pos.x === x && g.pos.y === y)) return false
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
        const e = state.world.createEntity()
        state.world.addComponent(e, ComponentType.Position, { x: tx, y: ty })
        state.world.addComponent(e, ComponentType.EntityTag, 'bee')
      } else if (definitionId === 'omnibox') {
        state.groundOmniboxes.push({ uid: droppedUid, pos: { x: tx, y: ty } })
      } else {
        const ge = state.world.createEntity()
        state.world.addComponent(ge, ComponentType.Position, { x: tx, y: ty })
        state.world.addComponent(ge, ComponentType.ItemDrop, { definitionId })
        state.world.addComponent(ge, ComponentType.EntityTag, 'groundItem')
      }
      return true
    }
  }

  return false
}
