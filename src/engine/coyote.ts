import {
  COYOTE_COLLECTIBLE_DEFINITIONS,
  COYOTE_FOLLOW_MAX_DIST,
  COYOTE_FOLLOW_MIN_DIST,
} from './constants'
import { ComponentType } from './ecs/types'
import { findFitPosition, placeItem } from './inventory'
import { getBlockedPositions } from './movement'
import { findPath } from './pathfinding'
import { CARDINAL, isInBounds, isWalkableTile, posKey } from './position'
import { CoyoteMode, Zone } from './types'

import type { Entity } from './ecs/types'
import type { GameState, Position } from './types'

/** Find the coyote ECS entity in the current zone. */
export const findCoyoteEntity = (state: GameState): Entity | null => {
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (identity?.definitionId !== 'coyote') continue
    const ez = state.world.getComponent(eid, ComponentType.EntityZone)
    if (ez?.zone !== state.currentZone) continue
    return eid
  }
  return null
}

/** Get the coyote's current position, or null if not found. */
export const getCoyotePosition = (state: GameState): Position | null => {
  const eid = findCoyoteEntity(state)
  if (eid === null) return null
  const pos = state.world.getComponent(eid, ComponentType.Position)
  return pos ? { x: pos.x, y: pos.y } : null
}

/** Find a walkable, unblocked tile adjacent to a target position. */
const findAdjacentWalkable = (state: GameState, target: Position, blocked: Set<string>): Position | null => {
  for (const d of CARDINAL) {
    const nx = target.x + d.x
    const ny = target.y + d.y
    if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
    if (!isWalkableTile(state.map[ny][nx].type)) continue
    if (blocked.has(posKey(nx, ny))) continue
    return { x: nx, y: ny }
  }
  return null
}

/** Chebyshev (chessboard) distance between two positions. */
const chebyshev = (a: Position, b: Position): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

/** Find the closest collectible ground item (meteorite or honey) to the coyote. */
const findNearestCollectible = (
  state: GameState,
  coyotePos: Position
): { eid: Entity; pos: Position; definitionId: string } | null => {
  let best: { eid: Entity; pos: Position; definitionId: string } | null = null
  let bestDist = Infinity

  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position, ComponentType.ItemDrop)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundItem') continue
    const ez = state.world.getComponent(eid, ComponentType.EntityZone)
    if (ez?.zone !== state.currentZone) continue
    const drop = state.world.getComponent(eid, ComponentType.ItemDrop)
    if (!drop) continue
    if (!(COYOTE_COLLECTIBLE_DEFINITIONS as readonly string[]).includes(drop.definitionId)) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    const dist = Math.abs(pos.x - coyotePos.x) + Math.abs(pos.y - coyotePos.y)
    if (dist < bestDist) {
      bestDist = dist
      best = { eid, pos: { x: pos.x, y: pos.y }, definitionId: drop.definitionId }
    }
  }

  return best
}

/** Find Gron's position via ECS query. */
const findGronPosition = (state: GameState): Position | null => {
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (identity?.definitionId !== 'gron') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos) return { x: pos.x, y: pos.y }
  }
  return null
}

/** Drop a ground item near a position using the cardinal+diagonal drop pattern. */
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

const dropGroundItemNear = (state: GameState, center: Position, definitionId: string): boolean => {
  for (const d of DROP_DELTAS) {
    const tx = center.x + d.x
    const ty = center.y + d.y
    if (!isInBounds(tx, ty, state.mapWidth, state.mapHeight)) continue
    if (!isWalkableTile(state.map[ty][tx].type)) continue
    const occupied = state.world.spatial.at(tx, ty).some(eid => {
      const tag = state.world.getComponent(eid, ComponentType.EntityTag)
      return tag === 'groundItem' || tag === 'groundOmnibox'
    })
    if (occupied) continue

    const ge = state.world.createEntity()
    state.world.addComponent(ge, ComponentType.Position, { x: tx, y: ty })
    state.world.addComponent(ge, ComponentType.ItemDrop, { definitionId })
    state.world.addComponent(ge, ComponentType.EntityTag, 'groundItem')
    state.world.addComponent(ge, ComponentType.EntityZone, { zone: state.currentZone })
    return true
  }
  return false
}

/**
 * Move the coyote one step along an A* path toward target.
 * Returns true if a step was taken.
 */
const stepToward = (state: GameState, eid: Entity, target: Position, blocked: Set<string>): boolean => {
  const pos = state.world.getComponent(eid, ComponentType.Position)
  if (!pos) return false

  // Remove self from blocked set to avoid self-blocking
  const selfKey = posKey(pos.x, pos.y)
  blocked.delete(selfKey)

  const path = findPath(state.map, state.mapWidth, state.mapHeight, { x: pos.x, y: pos.y }, target, blocked)
  if (!path || path.length === 0) {
    blocked.add(selfKey)
    return false
  }

  const next = path[0]
  blocked.add(posKey(next.x, next.y))
  state.world.moveEntity(eid, next.x, next.y)
  return true
}

/** Toggle coyote mode between follow and collect. */
export const toggleCoyoteMode = (state: GameState): void => {
  state.coyoteMode = state.coyoteMode === CoyoteMode.Follow ? CoyoteMode.Collect : CoyoteMode.Follow
  state.coyotePath = null
}

/** Summon the coyote to a tile adjacent to the player. */
export const summonCoyote = (state: GameState): boolean => {
  const eid = findCoyoteEntity(state)
  if (eid === null) return false

  const blocked = getBlockedPositions(state)
  blocked.add(posKey(state.player.x, state.player.y))

  const adjacent = findAdjacentWalkable(state, state.player, blocked)
  if (!adjacent) return false

  state.world.moveEntity(eid, adjacent.x, adjacent.y)
  // Update zone in case coyote was in a different zone
  state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })
  state.coyotePath = null
  return true
}

export interface CoyoteTickResult {
  pickedUp: { definitionId: string; x: number; y: number } | null
  delivered: { definitionId: string; x: number; y: number; toGron: boolean } | null
  modeChanged: boolean
}

/** Main coyote tick — called from game loop. */
export const tickCoyote = (state: GameState): CoyoteTickResult => {
  const result: CoyoteTickResult = { pickedUp: null, delivered: null, modeChanged: false }
  const eid = findCoyoteEntity(state)
  if (eid === null) return result

  const pos = state.world.getComponent(eid, ComponentType.Position)
  if (!pos) return result

  const blocked = getBlockedPositions(state)
  blocked.add(posKey(state.player.x, state.player.y))

  if (state.coyoteMode === CoyoteMode.Follow) {
    tickFollow(state, eid, pos, blocked)
  } else {
    tickCollect(state, eid, pos, blocked, result)
  }

  return result
}

const tickFollow = (
  state: GameState,
  eid: Entity,
  pos: { x: number; y: number },
  blocked: Set<string>
): void => {
  const dist = chebyshev(pos, state.player)
  if (dist <= COYOTE_FOLLOW_MIN_DIST) return
  if (dist > COYOTE_FOLLOW_MAX_DIST) {
    // Temporarily remove the player from blocked set so we can pathfind to their tile
    const playerKey = posKey(state.player.x, state.player.y)
    blocked.delete(playerKey)
    stepToward(state, eid, state.player, blocked)
    blocked.add(playerKey)
  }
}

const tickCollect = (
  state: GameState,
  eid: Entity,
  pos: { x: number; y: number },
  blocked: Set<string>,
  result: CoyoteTickResult
): void => {
  const coyotePos = { x: pos.x, y: pos.y }

  if (state.coyoteCargo === null) {
    // Not carrying — seek nearest collectible
    const target = findNearestCollectible(state, coyotePos)
    if (!target) return // idle

    // If on the item tile, pick it up
    if (target.pos.x === pos.x && target.pos.y === pos.y) {
      state.world.destroyEntity(target.eid)
      state.coyoteCargo = target.definitionId
      result.pickedUp = { definitionId: target.definitionId, x: pos.x, y: pos.y }
      return
    }

    // Step toward the item
    stepToward(state, eid, target.pos, blocked)
  } else {
    // Carrying — try to deliver to player
    const playerDist = chebyshev(coyotePos, state.player)
    if (playerDist <= 1) {
      // Adjacent to player — try backpack
      const fit = findFitPosition(state.backpack, state.coyoteCargo)
      if (fit) {
        placeItem(state.backpack, state.coyoteCargo, fit.gridX, fit.gridY)
        result.delivered = {
          definitionId: state.coyoteCargo,
          x: state.player.x,
          y: state.player.y,
          toGron: false,
        }
        state.coyoteCargo = null
        return
      }

      // Backpack full — go to Gron
      const gronPos = findGronPosition(state)
      if (gronPos) {
        const gronDist = chebyshev(coyotePos, gronPos)
        if (gronDist <= 1) {
          // Adjacent to Gron — drop item
          if (dropGroundItemNear(state, gronPos, state.coyoteCargo)) {
            result.delivered = {
              definitionId: state.coyoteCargo,
              x: gronPos.x,
              y: gronPos.y,
              toGron: true,
            }
            state.coyoteCargo = null
            return
          }
          // Gron area full — idle holding cargo
          return
        }

        // Walk toward Gron
        stepToward(state, eid, gronPos, blocked)
        return
      }
    }

    // Not adjacent to player — walk toward player
    const playerKey = posKey(state.player.x, state.player.y)
    blocked.delete(playerKey)
    stepToward(state, eid, state.player, blocked)
    blocked.add(playerKey)
  }
}

/** Teleport coyote to adjacent tile in a new zone after cave transition. */
export const transitionCoyoteToZone = (state: GameState, zone: typeof Zone.Overworld | typeof Zone.Cave): void => {
  // Find coyote in any zone
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (identity?.definitionId !== 'coyote') continue

    // Update zone
    state.world.addComponent(eid, ComponentType.EntityZone, { zone })

    // Find adjacent walkable tile near player
    const blocked = getBlockedPositions(state, zone)
    blocked.add(posKey(state.player.x, state.player.y))
    const adjacent = findAdjacentWalkable(state, state.player, blocked)
    if (adjacent) {
      state.world.moveEntity(eid, adjacent.x, adjacent.y)
    }

    state.coyotePath = null
    return
  }
}
