import { MOVE_ORDER_MARKER_DURATION_MS } from './constants'
import { ComponentType } from './ecs/types'
import { getBlockedPositions } from './movement'
import { findPath } from './pathfinding'
import { CARDINAL, isInBounds, isWalkableTile, posKey } from './position'

import type { GameState, Position, UnitCommand } from './types'

/**
 * Issue a move command to all selected NPC units.
 * Each unit independently pathfinds to the target or a nearby tile.
 */
export const issueMoveCommand = (state: GameState, target: Position): void => {
  if (state.selectedUnits.size === 0) return
  if (!isInBounds(target.x, target.y, state.mapWidth, state.mapHeight)) return
  if (!isWalkableTile(state.map[target.y][target.x].type)) return

  const blocked = getBlockedPositions(state)
  // Remove player from blocked — units should be able to walk through the player
  blocked.delete(posKey(state.player.x, state.player.y))

  const assignedTiles = new Set<string>()

  // Assign destinations — first unit gets exact target, others get nearby tiles
  const units = [...state.selectedUnits]

  for (const eid of units) {
    if (!state.world.isAlive(eid)) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue

    // Remove self from blocked so unit doesn't self-block
    const selfKey = posKey(pos.x, pos.y)
    blocked.delete(selfKey)

    const dest = findAvailableDestination(state, target, assignedTiles, blocked)
    if (!dest) {
      blocked.add(selfKey)
      continue
    }

    assignedTiles.add(posKey(dest.x, dest.y))

    const path = findPath(state.map, state.mapWidth, state.mapHeight, { x: pos.x, y: pos.y }, dest, blocked)
    blocked.add(selfKey)

    const cmd: UnitCommand = {
      targetEntityId: eid,
      target: dest,
      path: path,
    }
    state.unitCommands.set(eid, cmd)
  }

  // Add move-order marker
  state.moveOrderMarkers.push({
    position: { x: target.x, y: target.y },
    time: performance.now(),
  })
}

/**
 * Find the target tile or the nearest available neighbor if the target is taken.
 */
const findAvailableDestination = (
  state: GameState,
  target: Position,
  assigned: Set<string>,
  blocked: Set<string>
): Position | null => {
  const targetKey = posKey(target.x, target.y)
  if (!assigned.has(targetKey) && !blocked.has(targetKey)) {
    return target
  }

  // Try cardinal neighbors
  for (const d of CARDINAL) {
    const nx = target.x + d.x
    const ny = target.y + d.y
    if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
    if (!isWalkableTile(state.map[ny][nx].type)) continue
    const key = posKey(nx, ny)
    if (assigned.has(key) || blocked.has(key)) continue
    return { x: nx, y: ny }
  }

  return null
}

/**
 * Tick all unit commands — move each commanded unit one step along its path.
 * Called from the game loop at the same cadence as coyote/ghost ticks.
 */
export const tickUnitCommands = (state: GameState): void => {
  const blocked = getBlockedPositions(state)
  blocked.delete(posKey(state.player.x, state.player.y))

  for (const [eid, cmd] of state.unitCommands) {
    if (!state.world.isAlive(eid)) {
      state.unitCommands.delete(eid)
      continue
    }

    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) {
      state.unitCommands.delete(eid)
      continue
    }

    // Already at destination
    if (pos.x === cmd.target.x && pos.y === cmd.target.y) {
      state.unitCommands.delete(eid)
      continue
    }

    if (!cmd.path || cmd.path.length === 0) {
      state.unitCommands.delete(eid)
      continue
    }

    const next = cmd.path[0]
    const nextKey = posKey(next.x, next.y)

    // Check if next tile is blocked (another entity moved there)
    const selfKey = posKey(pos.x, pos.y)
    blocked.delete(selfKey)
    if (blocked.has(nextKey)) {
      // Path blocked — stop (no automatic repath)
      blocked.add(selfKey)
      state.unitCommands.delete(eid)
      continue
    }

    state.world.moveEntity(eid, next.x, next.y)
    blocked.add(posKey(next.x, next.y))
    cmd.path.shift()

    if (cmd.path.length === 0) {
      state.unitCommands.delete(eid)
    }
  }
}

/** Remove expired move-order markers. */
export const cleanupMoveOrderMarkers = (state: GameState, time: number): void => {
  state.moveOrderMarkers = state.moveOrderMarkers.filter(
    (m) => time - m.time < MOVE_ORDER_MARKER_DURATION_MS
  )
}

/** Clear all unit commands (used on zone transitions). */
export const clearAllUnitCommands = (state: GameState): void => {
  state.unitCommands.clear()
}
