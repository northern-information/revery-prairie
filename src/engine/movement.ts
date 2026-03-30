import { updateCamera } from './camera'
import { checkTransition } from './cave'
import { TRAIL_MAX_LENGTH } from './constants'
import { ComponentType } from './ecs/types'
import { updateFacingEntity } from './interaction'
import { DIRECTIONS, isInBounds, isWalkableTile, posKey } from './position'
import { Zone } from './types'

import type { Direction, GameState, Position } from './types'

export const getBlockedPositions = (state: GameState, zone?: Zone): Set<string> => {
  const z = zone ?? state.currentZone
  const set = new Set<string>()
  for (const eid of state.world.query(ComponentType.Blocking, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== z) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos) {
      set.add(posKey(pos.x, pos.y))
    }
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

  state.trail.push({ x: state.player.x, y: state.player.y, time: performance.now() })
  if (state.trail.length > TRAIL_MAX_LENGTH) {
    state.trail.shift()
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
