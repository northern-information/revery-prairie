import { updateCamera } from './camera'
import { checkTransition } from './cave'
import { MOVEMENT_TWEEN_DEFAULT_MS, MOVEMENT_TWEEN_SPRINT_MS, TRAIL_MAX_LENGTH } from './constants'
import { ComponentType } from './ecs/types'
import { updateFacingEntity } from './interaction'
import { recordDiscovery } from './manual'
import { DIRECTIONS, isInBounds, isWalkableTile, posKey } from './position'
import { TileType, Zone } from './types'
import { isEntityInCurrentZone } from './zone'

import type { Direction, GameState, Position } from './types'

// Filter matching the current zone (with ruinIndex) when zone arg is omitted
// or matches state.currentZone; otherwise falls back to zone-only comparison
// for callers that ask about a different zone than the active one.
const inZoneForBlocking = (state: GameState, eid: number, zone: Zone): boolean => {
  if (zone === state.currentZone) return isEntityInCurrentZone(state, eid)
  return state.world.getComponent(eid, ComponentType.EntityZone)?.zone === zone
}

export const getBlockedPositions = (
  state: GameState,
  zone?: Zone,
  opts?: { ignoreCoyote?: boolean }
): Set<string> => {
  const z = zone ?? state.currentZone
  const set = new Set<string>()
  for (const eid of state.world.query(ComponentType.Blocking, ComponentType.Position)) {
    if (!inZoneForBlocking(state, eid, z)) continue
    if (opts?.ignoreCoyote) {
      const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
      if (identity?.definitionId === 'coyote') continue
    }
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos) {
      set.add(posKey(pos.x, pos.y))
    }
  }
  // Angel body tiles block movement
  for (const eid of state.world.query(ComponentType.AngelData, ComponentType.MultiPosition)) {
    if (!inZoneForBlocking(state, eid, z)) continue
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    if (!multi) continue
    for (const p of multi.positions) {
      set.add(posKey(p.x, p.y))
    }
  }
  return set
}

// Extended blockers for click-to-move pathfinding — avoids cave entrances
// unless they are the target. Prevents accidental zone transitions when
// clicking past the entrance.
export const getPathfindingBlockers = (state: GameState, target?: Position): Set<string> => {
  const set = getBlockedPositions(state, undefined, { ignoreCoyote: true })
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
  const blocked = getBlockedPositions(state, undefined, { ignoreCoyote: true })
  if (blocked.has(posKey(nx, ny))) {
    updateFacingEntity(state)
    return false
  }

  // Remember the tile the player is leaving for potential collapse
  const prevX = state.player.x
  const prevY = state.player.y
  const prevTile = state.map[prevY]?.[prevX]

  state.trail.push({ x: state.player.x, y: state.player.y, time: performance.now() })
  if (state.trail.length > TRAIL_MAX_LENGTH) {
    state.trail.shift()
  }
  state.player.x = nx
  state.player.y = ny

  state.playerTween = {
    fromX: prevX,
    fromY: prevY,
    startTime: performance.now(),
    durationMs: state.sprinting ? MOVEMENT_TWEEN_SPRINT_MS : MOVEMENT_TWEEN_DEFAULT_MS,
  }

  // Collapse unstable ruin floor behind the player
  if (prevTile?.type === TileType.RuinUnstable && state.currentZone === Zone.Ruin) {
    state.map[prevY][prevX] = { type: TileType.Space }
  }
  updateCamera(state)
  updateFacingEntity(state)

  // Glinting zone: restore glint to all dull backpack coins
  if (state.currentZone === Zone.Overworld && state.glintZones.has(posKey(nx, ny))) {
    for (const item of state.backpack.items) {
      if (item.definitionId === 'coin' && !state.glintingCoins.has(item.uid)) {
        state.glintingCoins.add(item.uid)
      }
    }
    recordDiscovery(state, 'event:glint-zone')
  }

  // Check for zone transitions (cave entrance/exit)
  if (checkTransition(state)) {
    updateCamera(state, true)
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
