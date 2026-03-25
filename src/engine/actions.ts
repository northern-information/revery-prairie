import { updateCamera } from './camera'
import {
  EXPLOSION_DURATION_MS,
  MAP_HEIGHT,
  MAP_WIDTH,
  SHOOTING_STAR_LAND_CHANCE,
  SHOOTING_STAR_MAX_ACTIVE,
  SHOOTING_STAR_MAX_AGE,
  SHOOTING_STAR_MAX_LENGTH,
  SHOOTING_STAR_MIN_LENGTH,
  SHOOTING_STAR_SPAWN_CHANCE,
} from './constants'
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

export interface PickUpResult {
  pickedUp: string[]
  opened: string[]
}

export const pickUpGroundItems = (state: GameState): PickUpResult => {
  const px = state.player.x
  const py = state.player.y
  const toRemove: number[] = []
  const pickedUp: string[] = []
  const opened: string[] = []

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

  // Pick up meteorites at the player's position
  const meteoritesToRemove: number[] = []
  for (let i = 0; i < state.meteorites.length; i++) {
    const m = state.meteorites[i]
    if (m?.pos.x === px && m?.pos.y === py) {
      const fit = findFitPosition(state.backpack, 'meteorite')
      if (fit) {
        placeItem(state.backpack, 'meteorite', fit.rotation, fit.gridX, fit.gridY)
        meteoritesToRemove.push(i)
        pickedUp.push('meteorite')
      }
    }
  }

  for (let i = meteoritesToRemove.length - 1; i >= 0; i--) {
    state.meteorites.splice(meteoritesToRemove[i] ?? 0, 1)
  }

  // Auto-open adjacent ground omniboxes, auto-close distant ones
  for (const go of state.groundOmniboxes) {
    const dx = Math.abs(go.pos.x - px)
    const dy = Math.abs(go.pos.y - py)
    const isAdjacent = dx <= 1 && dy <= 1
    const container = state.omniboxContainers.get(go.uid)
    if (!container) continue

    if (isAdjacent && !state.openContainers.includes(container)) {
      state.openContainers.push(container)
      opened.push(container.name)
    } else if (!isAdjacent && state.openContainers.includes(container)) {
      state.openContainers = state.openContainers.filter(c => c.id !== go.uid)
    }
  }

  return { pickedUp, opened }
}

export const movePlayer = (state: GameState, dir: Direction): boolean => {
  const d = DELTAS[dir]
  const nx = state.player.x + d.x
  const ny = state.player.y + d.y

  if (nx < 0 || nx >= state.mapWidth || ny < 0 || ny >= state.mapHeight) return false
  if (state.map[ny][nx].type === TileType.Space) return false
  if (state.groundOmniboxes.some(go => go.pos.x === nx && go.pos.y === ny)) return false

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
  for (const oc of state.openContainers) {
    if (containerHasItem(oc, definitionId)) return true
  }
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
        openOmnibox(state, droppedUid)
      } else {
        state.groundItems.push({ definitionId, pos: { x: tx, y: ty } })
      }
      return true
    }
  }

  return false
}

export const spawnShootingStar = (state: GameState): void => {
  if (state.shootingStars.length >= SHOOTING_STAR_MAX_ACTIVE) return
  if (Math.random() >= SHOOTING_STAR_SPAWN_CHANCE) return

  // Pick a random edge: 0=top, 1=bottom, 2=left, 3=right
  const edge = Math.floor(Math.random() * 4)
  let x: number
  let y: number
  let dx: number
  let dy: number

  if (edge === 0) {
    // top edge — move downward
    x = Math.floor(Math.random() * MAP_WIDTH)
    y = 0
    dx = Math.random() < 0.5 ? -1 : 1
    dy = 1
  } else if (edge === 1) {
    // bottom edge — move upward
    x = Math.floor(Math.random() * MAP_WIDTH)
    y = MAP_HEIGHT - 1
    dx = Math.random() < 0.5 ? -1 : 1
    dy = -1
  } else if (edge === 2) {
    // left edge — move rightward
    x = 0
    y = Math.floor(Math.random() * MAP_HEIGHT)
    dx = 1
    dy = Math.random() < 0.5 ? -1 : 1
  } else {
    // right edge — move leftward
    x = MAP_WIDTH - 1
    y = Math.floor(Math.random() * MAP_HEIGHT)
    dx = -1
    dy = Math.random() < 0.5 ? -1 : 1
  }

  // Occasional cardinal direction (drop one axis)
  if (Math.random() < 0.3) {
    if (Math.random() < 0.5) dx = 0
    else dy = 0
  }

  // Ensure we don't get a stationary star
  if (dx === 0 && dy === 0) dy = 1

  const length =
    SHOOTING_STAR_MIN_LENGTH + Math.floor(Math.random() * (SHOOTING_STAR_MAX_LENGTH - SHOOTING_STAR_MIN_LENGTH + 1))
  const willLand = Math.random() < SHOOTING_STAR_LAND_CHANCE

  state.shootingStars.push({ pos: { x, y }, dx, dy, length, age: 0, willLand, landingTarget: null })
}

export const spawnShootingStarAtTarget = (
  state: GameState,
  target: Position,
  direction?: { dx: number; dy: number }
): void => {
  const dx = direction?.dx ?? (Math.random() < 0.5 ? 1 : -1)
  const dy = direction?.dy ?? (Math.random() < 0.5 ? 1 : -1)

  // Trace backward from target to find the starting edge position
  let sx = target.x
  let sy = target.y
  while (sx >= 0 && sx < MAP_WIDTH && sy >= 0 && sy < MAP_HEIGHT) {
    sx -= dx
    sy -= dy
  }

  const length =
    SHOOTING_STAR_MIN_LENGTH + Math.floor(Math.random() * (SHOOTING_STAR_MAX_LENGTH - SHOOTING_STAR_MIN_LENGTH + 1))

  state.shootingStars.push({
    pos: { x: sx, y: sy },
    dx,
    dy,
    length,
    age: 0,
    willLand: true,
    landingTarget: target,
  })
}

export const tickShootingStars = (state: GameState, time: number): void => {
  const toRemove: number[] = []

  for (let i = 0; i < state.shootingStars.length; i++) {
    const star = state.shootingStars[i]
    if (!star) continue

    star.pos.x += star.dx
    star.pos.y += star.dy
    star.age++

    // Check if the star should land
    if (star.willLand) {
      const { x, y } = star.pos
      if (star.landingTarget) {
        // Targeted landing — only land on the exact target tile
        if (x === star.landingTarget.x && y === star.landingTarget.y) {
          state.meteorites.push({ pos: { x, y } })
          state.explosions.push({ pos: { x, y }, startTime: time })
          toRemove.push(i)
          continue
        }
      } else if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
        // Untargeted landing — land on first walkable tile
        const tile = state.map[y][x]
        if (tile.type === TileType.Dirt || tile.type === TileType.Clover) {
          state.meteorites.push({ pos: { x, y } })
          state.explosions.push({ pos: { x, y }, startTime: time })
          toRemove.push(i)
          continue
        }
      }
    }

    // Remove if off-map (beyond bounds + trail length buffer) or too old
    const buffer = star.length + 1
    if (
      star.pos.x < -buffer ||
      star.pos.x >= MAP_WIDTH + buffer ||
      star.pos.y < -buffer ||
      star.pos.y >= MAP_HEIGHT + buffer ||
      star.age > SHOOTING_STAR_MAX_AGE
    ) {
      toRemove.push(i)
    }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    state.shootingStars.splice(toRemove[i] ?? 0, 1)
  }

  // Clean up expired explosions
  state.explosions = state.explosions.filter(e => time - e.startTime <= EXPLOSION_DURATION_MS)
}

export const groundOmniboxBlockedSet = (state: GameState): Set<string> => {
  const set = new Set<string>()
  for (const go of state.groundOmniboxes) {
    set.add(`${String(go.pos.x)},${String(go.pos.y)}`)
  }
  return set
}

export const openOmnibox = (state: GameState, uid: string): boolean => {
  const container = state.omniboxContainers.get(uid)
  if (!container) return false
  if (state.openContainers.includes(container)) return false
  state.openContainers.push(container)
  return true
}

export const closeOmnibox = (state: GameState, uid: string): void => {
  state.openContainers = state.openContainers.filter(c => c.id !== uid)
}

export const grabOmnibox = (state: GameState): string | null => {
  const px = state.player.x
  const py = state.player.y

  // Find adjacent ground omnibox (4-directional)
  for (let i = 0; i < state.groundOmniboxes.length; i++) {
    const go = state.groundOmniboxes[i]
    const dx = Math.abs(go.pos.x - px)
    const dy = Math.abs(go.pos.y - py)
    if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
      // Try to fit in backpack
      const fit = findFitPosition(state.backpack, 'omnibox')
      if (!fit) return null

      const placed = placeItem(state.backpack, 'omnibox', fit.rotation, fit.gridX, fit.gridY)
      if (!placed) return null

      // Override the uid to match the omnibox's container mapping
      placed.uid = go.uid

      // Remove from ground, close if open
      state.groundOmniboxes.splice(i, 1)
      state.openContainers = state.openContainers.filter(c => c.id !== go.uid)

      return go.uid
    }
  }

  return null
}
