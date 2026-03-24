import { updateCamera } from './camera'
import {
  containerHasItem,
  findFitPosition,
  findItemByDefinition,
  getActiveContainers,
  placeItem,
  removeItem,
} from './inventory'
import { TileType } from './types'

import type { Direction, GameState, Position } from './types'

const DELTAS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export const pickUpGroundItems = (state: GameState): string[] => {
  const px = state.player.x
  const py = state.player.y
  const toRemove: number[] = []
  const pickedUp: string[] = []

  for (let i = 0; i < state.groundItems.length; i++) {
    const gi = state.groundItems[i]
    if (gi?.pos.x === px && gi?.pos.y === py) {
      const fit = findFitPosition(state.backpack, gi.definitionId)
      if (fit) {
        placeItem(state.backpack, gi.definitionId, fit.rotation, fit.gridX, fit.gridY)
        toRemove.push(i)
        pickedUp.push(gi.definitionId)
      }
    }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    state.groundItems.splice(toRemove[i] ?? 0, 1)
  }

  // Capture bees at the player's position
  const beesToRemove: number[] = []
  for (let i = 0; i < state.bees.length; i++) {
    const bee = state.bees[i]
    if (bee?.pos.x === px && bee?.pos.y === py) {
      const fit = findFitPosition(state.backpack, 'bee')
      if (fit) {
        placeItem(state.backpack, 'bee', fit.rotation, fit.gridX, fit.gridY)
        beesToRemove.push(i)
        pickedUp.push('bee')
      }
    }
  }

  for (let i = beesToRemove.length - 1; i >= 0; i--) {
    state.bees.splice(beesToRemove[i] ?? 0, 1)
  }

  return pickedUp
}

export const movePlayer = (state: GameState, dir: Direction): boolean => {
  const d = DELTAS[dir]
  const nx = state.player.x + d.x
  const ny = state.player.y + d.y

  if (nx < 0 || nx >= state.mapWidth || ny < 0 || ny >= state.mapHeight) return false
  if (state.map[ny][nx].type === TileType.Space) return false

  state.player.x = nx
  state.player.y = ny
  updateCamera(state)
  return true
}

const findAndRemoveItem = (state: GameState, definitionId: string): boolean => {
  const containers = getActiveContainers(state)
  for (const container of containers) {
    const item = findItemByDefinition(container, definitionId)
    if (item) {
      removeItem(container, item.uid)
      return true
    }
  }
  return false
}

const hasItemInAnyContainer = (state: GameState, definitionId: string): boolean => {
  if (containerHasItem(state.backpack, definitionId)) return true
  if (state.openContainer && containerHasItem(state.openContainer, definitionId)) return true
  return false
}

export const combineBeeAndClover = (state: GameState): boolean => {
  const hasBee = hasItemInAnyContainer(state, 'bee')
  const hasClover = hasItemInAnyContainer(state, 'clover')

  if (!hasBee || !hasClover) return false

  const standingOn = state.map[state.player.y][state.player.x].type
  if (standingOn === TileType.Sand || standingOn === TileType.Space) return false

  findAndRemoveItem(state, 'bee')
  findAndRemoveItem(state, 'clover')

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = state.player.x + dx
      const ty = state.player.y + dy
      if (tx >= 0 && tx < state.mapWidth && ty >= 0 && ty < state.mapHeight) {
        const tile = state.map[ty][tx]
        if (tile.type !== TileType.Sand && tile.type !== TileType.Space) {
          state.map[ty][tx] = { type: TileType.Clover }
        }
      }
    }
  }

  // Spawn a bee at the player's position
  state.bees.push({ pos: { x: state.player.x, y: state.player.y } })

  return true
}

export const tickPath = (state: GameState): boolean => {
  if (!state.path || state.path.length === 0) {
    state.path = null
    return false
  }

  const next = state.path[0]
  const dx = next.x - state.player.x
  const dy = next.y - state.player.y

  let dir: Direction | null = null
  if (dx === 1 && dy === 0) dir = 'right'
  else if (dx === -1 && dy === 0) dir = 'left'
  else if (dx === 0 && dy === -1) dir = 'up'
  else if (dx === 0 && dy === 1) dir = 'down'

  if (!dir || !movePlayer(state, dir)) {
    state.path = null
    state.pendingAction = null
    state.previewFn = null
    return false
  }

  state.path.shift()
  if (state.path.length === 0) {
    state.path = null
    if (state.pendingAction) {
      state.pendingAction()
      state.pendingAction = null
    }
  }
  return true
}

export const NEIGHBOR_DELTAS: Position[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
]

export const tickBees = (state: GameState): void => {
  for (const bee of state.bees) {
    // Only move sometimes — gives a lazy, buzzing feel
    if (Math.random() > 0.3) continue

    // Collect neighboring clover tiles
    const cloverCandidates: Position[] = []
    const walkableCandidates: Position[] = []
    for (const d of NEIGHBOR_DELTAS) {
      const nx = bee.pos.x + d.x
      const ny = bee.pos.y + d.y
      if (nx >= 0 && nx < state.mapWidth && ny >= 0 && ny < state.mapHeight) {
        const tile = state.map[ny][nx]
        if (tile.type === TileType.Clover) {
          cloverCandidates.push({ x: nx, y: ny })
        } else if (tile.type !== TileType.Space) {
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
  if (x < 0 || x >= state.mapWidth || y < 0 || y >= state.mapHeight) return false
  if (state.map[y][x].type === TileType.Space) return false
  if (state.groundItems.some(g => g.pos.x === x && g.pos.y === y)) return false
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
      removeItem(sourceContainer, sourceItem.uid)
      // Bees are released as world entities instead of ground items
      if (definitionId === 'bee') {
        state.bees.push({ pos: { x: tx, y: ty } })
      } else {
        state.groundItems.push({ definitionId, pos: { x: tx, y: ty } })
      }
      return true
    }
  }

  return false
}
