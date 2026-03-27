import { updateCamera } from './camera'
import { getCharacterDefinition } from './characters'
import {
  EXPLOSION_DURATION_MS,
  MAP_HEIGHT,
  MAP_WIDTH,
  PICKUP_EFFECT_DURATION_MS,
  SHOOTING_STAR_LAND_CHANCE,
  SHOOTING_STAR_MAX_ACTIVE,
  SHOOTING_STAR_MAX_AGE,
  SHOOTING_STAR_MAX_LENGTH,
  SHOOTING_STAR_MIN_LENGTH,
  SHOOTING_STAR_SPAWN_CHANCE,
} from './constants'
import {
  containerHasItem,
  createOmniboxContainer,
  findFitPosition,
  findItemByDefinition,
  getActiveContainers,
  placeItem,
  removeItem,
} from './inventory'
import { checkTransition } from './cave'
import { CARDINAL, DIRECTIONS, isInBounds, isWalkableTile, ORDINAL, posKey, removeByIndices } from './position'
import { RECIPES } from './recipes'
import { Rotation, TileType, Zone } from './types'

import type { Character, Container, Direction, GameState, Position } from './types'

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

const CHAIN_EXPLOSION_CHANCE = 1 / 7
const CHAIN_EXPLOSION_RADIUS = 3
const CHAIN_EXPLOSION_COUNT = 3

const isTileOccupied = (state: GameState, x: number, y: number): boolean => {
  const key = posKey(x, y)
  if (state.player.x === x && state.player.y === y) return true
  if (state.meteorites.some((m) => m.pos.x === x && m.pos.y === y)) return true
  if (state.groundItems.some((g) => g.pos.x === x && g.pos.y === y)) return true
  if (state.groundOmniboxes.some((g) => g.pos.x === x && g.pos.y === y)) return true
  if (state.characters.some((c) => posKey(c.pos.x, c.pos.y) === key)) return true
  if (state.ghosts.some((g) => posKey(g.pos.x, g.pos.y) === key)) return true
  return false
}

export const spawnChainMeteorites = (
  state: GameState,
  origin: Position,
  time: number
): number => {
  const candidates: Position[] = []
  for (let dy = -CHAIN_EXPLOSION_RADIUS; dy <= CHAIN_EXPLOSION_RADIUS; dy++) {
    for (let dx = -CHAIN_EXPLOSION_RADIUS; dx <= CHAIN_EXPLOSION_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue
      const x = origin.x + dx
      const y = origin.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
      if (!isWalkableTile(state.map[y][x].type)) continue
      if (isTileOccupied(state, x, y)) continue
      candidates.push({ x, y })
    }
  }

  // Shuffle and take up to CHAIN_EXPLOSION_COUNT
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const spawned = Math.min(CHAIN_EXPLOSION_COUNT, candidates.length)
  for (let i = 0; i < spawned; i++) {
    const pos = candidates[i]
    state.meteorites.push({ pos })
    state.explosions.push({ pos, startTime: time })
  }

  return spawned
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
      if (m.pos.x === px && m.pos.y === py && Math.random() < CHAIN_EXPLOSION_CHANCE) {
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

export const movePlayer = (state: GameState, dir: Direction): boolean => {
  const d = DIRECTIONS[dir]
  const nx = state.player.x + d.x
  const ny = state.player.y + d.y

  // Always update facing, even on failed moves — lets the player
  // look toward walls, corners, and blocked entities.
  state.playerFacing = dir

  if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) {
    updateFacingEntity(state)
    return false
  }
  if (!isWalkableTile(state.map[ny][nx].type)) {
    updateFacingEntity(state)
    return false
  }
  const blocked = getBlockedPositions(state)
  if (blocked.has(posKey(nx, ny))) {
    updateFacingEntity(state)
    return false
  }

  state.player.x = nx
  state.player.y = ny
  updateCamera(state)
  updateFacingEntity(state)

  // Check for zone transitions (cave entrance/exit)
  if (checkTransition(state)) {
    updateCamera(state)
    return true
  }

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

  // Check standing tile before consuming items — recipe.execute also checks,
  // but we need to bail before removing ingredients
  const standingOn = state.map[state.player.y][state.player.x].type
  if (standingOn === TileType.Sand || !isWalkableTile(standingOn)) return false

  findAndRemoveItem(state, 'bee')
  findAndRemoveItem(state, 'clover')

  const prairie = RECIPES.find(r => r.resultName === 'prairie')
  if (!prairie) return false
  return prairie.execute(state)
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
    state.pathWaypoints = []
    state.pendingAction = null
    state.pendingInteractionTarget = null
    state.previewFn = null
    return false
  }

  // movePlayer may have triggered a zone transition which clears the path
  if (!state.path) return true

  state.path.shift()
  if (state.path.length === 0) {
    state.path = null
    state.pathWaypoints = []
    if (state.pendingAction) {
      state.pendingAction()
      state.pendingAction = null
    }
  }
  return true
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
  while (isInBounds(sx, sy, MAP_WIDTH, MAP_HEIGHT)) {
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
      } else if (isInBounds(x, y, MAP_WIDTH, MAP_HEIGHT)) {
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

  removeByIndices(state.shootingStars, toRemove)

  // Clean up expired explosions
  state.explosions = state.explosions.filter(e => time - e.startTime <= EXPLOSION_DURATION_MS)

  // Clean up expired meteorite pickup effects
  state.meteoritePickupEffects = state.meteoritePickupEffects.filter(
    e => time - e.startTime <= PICKUP_EFFECT_DURATION_MS
  )
}

export const groundOmniboxBlockedSet = (state: GameState): Set<string> => {
  const set = new Set<string>()
  for (const go of state.groundOmniboxes) {
    set.add(posKey(go.pos.x, go.pos.y))
  }
  return set
}

export const getBlockedPositions = (state: GameState): Set<string> => {
  const set = new Set<string>()
  for (const go of state.groundOmniboxes) {
    set.add(posKey(go.pos.x, go.pos.y))
  }
  for (const c of state.characters) {
    set.add(posKey(c.pos.x, c.pos.y))
  }
  for (const g of state.ghosts) {
    set.add(posKey(g.pos.x, g.pos.y))
  }
  return set
}

// Extended blockers for click-to-move pathfinding — avoids cave entrances
// unless they are the target. Prevents accidental zone transitions when
// clicking past the entrance.
export const getPathfindingBlockers = (state: GameState, target?: Position): Set<string> => {
  const set = getBlockedPositions(state)
  const targetKey = target ? posKey(target.x, target.y) : null

  // Block cave entrance so paths don't route through it
  if (state.currentZone === Zone.Overworld) {
    const key = posKey(state.caveEntranceOverworld.x, state.caveEntranceOverworld.y)
    if (key !== targetKey) {
      set.add(key)
    }
  } else if (state.currentZone === Zone.Cave) {
    const key = posKey(state.caveEntranceInterior.x, state.caveEntranceInterior.y)
    if (key !== targetKey) {
      set.add(key)
    }
  }

  return set
}

export const openOmnibox = (state: GameState, uid: string): boolean => {
  const container = state.omniboxContainers.get(uid)
  if (!container) return false
  if (state.openContainer === container) return false
  // Close previous omnibox before opening new one
  state.openContainer = container
  return true
}

export const closeOmnibox = (state: GameState): void => {
  state.openContainer = null
}

export const toggleOmnibox = (state: GameState, uid: string): boolean => {
  const container = state.omniboxContainers.get(uid)
  if (!container) return false
  if (state.openContainer === container) {
    state.openContainer = null
    return true
  }
  state.openContainer = container
  return true
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

      // Remove from ground (keep open if it was open)
      state.groundOmniboxes.splice(i, 1)
      updateFacingEntity(state)

      return go.uid
    }
  }

  return null
}

export const isInteractableAt = (state: GameState, x: number, y: number): boolean => {
  if (state.groundOmniboxes.some(go => go.pos.x === x && go.pos.y === y)) return true
  if (state.characters.some(c => c.pos.x === x && c.pos.y === y)) return true
  if (
    state.currentZone === Zone.Cave &&
    !state.caveRevealed &&
    isInBounds(x, y, state.mapWidth, state.mapHeight) &&
    state.map[y][x].type === TileType.CaveBreakableWall
  ) {
    return true
  }
  return false
}

export const updateFacingEntity = (state: GameState): void => {
  const switchIfOpen = (x: number, y: number) => {
    const go = state.groundOmniboxes.find(g => g.pos.x === x && g.pos.y === y)
    if (
      go &&
      state.openContainer &&
      state.groundOmniboxes.some(g => g.uid === state.openContainer?.id) &&
      state.openContainer.id !== go.uid
    ) {
      const container = state.omniboxContainers.get(go.uid)
      if (container) state.openContainer = container
    }
  }

  // Prefer the interactable in the facing direction
  const d = DIRECTIONS[state.playerFacing]
  const fx = state.player.x + d.x
  const fy = state.player.y + d.y
  if (isInteractableAt(state, fx, fy)) {
    state.facingEntityPos = { x: fx, y: fy }
    switchIfOpen(fx, fy)
    return
  }
  // Fall back to any cardinally adjacent interactable
  for (const cd of CARDINAL) {
    const nx = state.player.x + cd.x
    const ny = state.player.y + cd.y
    if (isInteractableAt(state, nx, ny)) {
      state.facingEntityPos = { x: nx, y: ny }
      switchIfOpen(nx, ny)
      return
    }
  }
  state.facingEntityPos = null
}

/** @deprecated Use updateFacingEntity instead */
export const updateFacingOmnibox = updateFacingEntity

export const toggleFacingOmnibox = (state: GameState): boolean => {
  if (state.facingEntityPos) {
    const go = state.groundOmniboxes.find(
      g => g.pos.x === state.facingEntityPos?.x && g.pos.y === state.facingEntityPos?.y
    )
    if (go) return toggleOmnibox(state, go.uid)
  }
  // Fall back to any cardinally adjacent omnibox
  const px = state.player.x
  const py = state.player.y
  for (const d of CARDINAL) {
    const go = state.groundOmniboxes.find(g => g.pos.x === px + d.x && g.pos.y === py + d.y)
    if (go) return toggleOmnibox(state, go.uid)
  }
  return false
}

export const getAdjacentCharacter = (state: GameState): Character | null => {
  const px = state.player.x
  const py = state.player.y
  // Prefer the character in the facing direction
  const d = DIRECTIONS[state.playerFacing]
  const fx = px + d.x
  const fy = py + d.y
  const facing = state.characters.find(c => c.pos.x === fx && c.pos.y === fy)
  if (facing) return facing
  // Fall back to any cardinally adjacent character
  for (const cd of CARDINAL) {
    const nx = px + cd.x
    const ny = py + cd.y
    const character = state.characters.find(c => c.pos.x === nx && c.pos.y === ny)
    if (character) return character
  }
  return null
}

export const interactWithCharacter = (state: GameState): boolean => {
  const character = getAdjacentCharacter(state)
  if (!character) return false
  state.activeDialog = {
    characterId: character.definitionId,
    lineIndex: 0,
    typingIndex: 0,
    typingDone: false,
    transitioning: false,
    transitionStartTime: 0,
  }
  return true
}

export const advanceDialog = (state: GameState): boolean => {
  if (!state.activeDialog) return false

  // If still typing, reveal the full line instantly
  if (!state.activeDialog.typingDone) {
    const def = getCharacterDefinition(state.activeDialog.characterId)
    const line = def.dialog[state.activeDialog.lineIndex]
    state.activeDialog.typingIndex = line.length
    state.activeDialog.typingDone = true
    return true
  }

  // If transitioning between lines, ignore
  if (state.activeDialog.transitioning) return true

  const def = getCharacterDefinition(state.activeDialog.characterId)
  if (state.activeDialog.lineIndex < def.dialog.length - 1) {
    state.activeDialog.transitioning = true
    state.activeDialog.transitionStartTime = performance.now()
    return true
  }
  state.activeDialog = null
  return false
}

const DIALOG_TRANSITION_MS = 300

export const tickDialogTransition = (state: GameState, now: number): void => {
  if (!state.activeDialog?.transitioning) return
  if (now - state.activeDialog.transitionStartTime < DIALOG_TRANSITION_MS) return
  state.activeDialog.lineIndex++
  state.activeDialog.typingIndex = 0
  state.activeDialog.typingDone = false
  state.activeDialog.transitioning = false
}

const DIALOG_TYPING_MS = 40

export const tickDialogTyping = (state: GameState, lastTypingTime: number, now: number): number => {
  if (!state.activeDialog || state.activeDialog.typingDone || state.activeDialog.transitioning) return lastTypingTime
  if (now - lastTypingTime < DIALOG_TYPING_MS) return lastTypingTime

  const def = getCharacterDefinition(state.activeDialog.characterId)
  const line = def.dialog[state.activeDialog.lineIndex]
  state.activeDialog.typingIndex++
  if (state.activeDialog.typingIndex >= line.length) {
    state.activeDialog.typingDone = true
  }
  return now
}

export { DIALOG_TRANSITION_MS }

export const giveMoabGift = (state: GameState): boolean => {
  if (state.moabGiftGiven) return false

  const fit = findFitPosition(state.backpack, 'omnibox')
  if (!fit) return false

  const omniboxItem = placeItem(state.backpack, 'omnibox', fit.rotation, fit.gridX, fit.gridY)
  if (!omniboxItem) return false

  const container = createOmniboxContainer(state, omniboxItem.uid)

  // Fill the omnibox with bees
  for (let y = 0; y < container.height; y++) {
    for (let x = 0; x < container.width; x++) {
      placeItem(container, 'bee', Rotation.R0, x, y)
    }
  }

  state.moabGiftGiven = true

  // Switch Moab's dialog to post-gift single line
  const def = getCharacterDefinition('moab')
  def.dialog = ['...']

  return true
}

export const breakWall = (state: GameState, time: number): boolean => {
  if (state.caveRevealed) return false
  if (state.currentZone !== Zone.Cave) return false

  const d = DIRECTIONS[state.playerFacing]
  const fx = state.player.x + d.x
  const fy = state.player.y + d.y
  if (!isInBounds(fx, fy, state.mapWidth, state.mapHeight)) return false
  if (state.map[fy][fx].type !== TileType.CaveBreakableWall) return false

  // Start crumble animation
  state.crumbleEffects.push({
    positions: [...state.caveBreakableWallPositions],
    startTime: time,
  })

  // Convert breakable wall tiles to CaveFloor
  for (const pos of state.caveBreakableWallPositions) {
    if (isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight)) {
      state.map[pos.y][pos.x] = { type: TileType.CaveFloor }
    }
  }

  // Reveal hidden chamber
  state.caveRevealed = true

  updateFacingEntity(state)
  return true
}
