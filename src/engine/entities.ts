import { CHAIN_EXPLOSION_CHANCE, spawnChainMeteorites } from './celestial'
import { findFitPosition, findItemByDefinition, getActiveContainers, placeItem, removeItem } from './inventory'
import { getBlockedPositions } from './movement'
import { isInBounds, isWalkableTile, ORDINAL, posKey, removeByIndices } from './position'
import { TileType } from './types'

import type { Container, GameState, Position } from './types'

export interface PickUpResult {
  pickedUp: string[]
  chainExplosions: number
}

const captureEntitiesAtPlayer = (
  entities: { pos: Position }[],
  px: number,
  py: number,
  backpack: Container,
  definitionId: string
): { removed: number[]; captured: string[] } => {
  const removed: number[] = []
  const captured: string[] = []
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]
    if (entity?.pos.x === px && entity?.pos.y === py) {
      const fit = findFitPosition(backpack, definitionId)
      if (fit) {
        placeItem(backpack, definitionId, fit.rotation, fit.gridX, fit.gridY)
        removed.push(i)
        captured.push(definitionId)
      }
    }
  }
  return { removed, captured }
}

export const pickUpGroundItems = (state: GameState, time?: number): PickUpResult => {
  const px = state.player.x
  const py = state.player.y
  const pickedUp: string[] = []

  // Ground items use their own definitionId
  for (let i = 0; i < state.groundItems.length; i++) {
    const gi = state.groundItems[i]
    if (gi?.pos.x === px && gi?.pos.y === py) {
      const fit = findFitPosition(state.backpack, gi.definitionId)
      if (fit) {
        placeItem(state.backpack, gi.definitionId, fit.rotation, fit.gridX, fit.gridY)
        pickedUp.push(gi.definitionId)
        state.groundItems.splice(i, 1)
        i--
      }
    }
  }

  const beeResult = captureEntitiesAtPlayer(state.bees, px, py, state.backpack, 'bee')
  removeByIndices(state.bees, beeResult.removed)
  pickedUp.push(...beeResult.captured)

  // Chain explosion: roll first, then capture survivors.
  // Exploded meteorites are consumed (removed, not picked up).
  let chainExplosions = 0
  const explodedIndices: number[] = []
  if (time !== undefined) {
    for (let i = 0; i < state.meteorites.length; i++) {
      const m = state.meteorites[i]
      if (m.pos.x === px && m.pos.y === py && !m.fromChain && Math.random() < CHAIN_EXPLOSION_CHANCE) {
        explodedIndices.push(i)
        chainExplosions += spawnChainMeteorites(state, { x: px, y: py }, time)
      }
    }
  }
  if (explodedIndices.length > 0) {
    removeByIndices(state.meteorites, explodedIndices)
  }

  const meteoriteResult = captureEntitiesAtPlayer(state.meteorites, px, py, state.backpack, 'meteorite')
  removeByIndices(state.meteorites, meteoriteResult.removed)
  pickedUp.push(...meteoriteResult.captured)

  if (meteoriteResult.removed.length > 0 && time !== undefined) {
    state.meteoritePickupEffects.push({ pos: { x: px, y: py }, startTime: time })
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
  for (const bee of state.bees) {
    // Only move sometimes — gives a lazy, buzzing feel
    if (Math.random() > 0.3) continue

    // Collect neighboring clover tiles
    const cloverCandidates: Position[] = []
    const walkableCandidates: Position[] = []
    for (const d of ORDINAL) {
      const nx = bee.pos.x + d.x
      const ny = bee.pos.y + d.y
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
      bee.pos.x = target.x
      bee.pos.y = target.y
    }
  }
}

export const tickGhosts = (state: GameState): void => {
  const blocked = getBlockedPositions(state)
  // Also block the player position
  blocked.add(posKey(state.player.x, state.player.y))

  for (const ghost of state.ghosts) {
    // Freeze ghost if player is talking to it
    if (state.activeDialog?.characterId === `ghost-${String(ghost.number)}`) continue
    // Ghosts drift slowly — 15% chance to move each tick
    if (Math.random() > 0.15) continue

    // Remove self from blocked set so we don't self-block
    const selfKey = posKey(ghost.pos.x, ghost.pos.y)
    blocked.delete(selfKey)

    const candidates: Position[] = []
    for (const d of ORDINAL) {
      const nx = ghost.pos.x + d.x
      const ny = ghost.pos.y + d.y
      if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
      if (!isWalkableTile(state.map[ny][nx].type)) continue
      if (blocked.has(posKey(nx, ny))) continue
      candidates.push({ x: nx, y: ny })
    }

    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)]
      blocked.add(posKey(target.x, target.y))
      ghost.pos.x = target.x
      ghost.pos.y = target.y
      // Sync the corresponding character entry
      const charEntry = state.characters.find(c => c.definitionId === `ghost-${String(ghost.number)}`)
      if (charEntry) {
        charEntry.pos.x = target.x
        charEntry.pos.y = target.y
      }
    } else {
      // Re-add self to blocked set since we didn't move
      blocked.add(selfKey)
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
  if (state.groundItems.some(g => g.pos.x === x && g.pos.y === y)) return false
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
        state.bees.push({ pos: { x: tx, y: ty } })
      } else if (definitionId === 'omnibox') {
        state.groundOmniboxes.push({ uid: droppedUid, pos: { x: tx, y: ty } })
      } else {
        state.groundItems.push({ definitionId, pos: { x: tx, y: ty } })
      }
      return true
    }
  }

  return false
}
