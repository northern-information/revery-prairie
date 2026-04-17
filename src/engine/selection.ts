import { ComponentType } from './ecs/types'
import { posKey } from './position'

import type { Entity } from './ecs/types'
import type { GameState, Position } from './types'

/** Character definition IDs that can be selected and commanded by the player. */
const CONTROLLABLE_IDS = new Set(['coyote', 'gron'])

/** Check if an entity is a controllable unit. */
export const isControllableUnit = (state: GameState, eid: Entity): boolean => {
  const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
  if (!identity) return false
  return CONTROLLABLE_IDS.has(identity.definitionId)
}

/** Find the controllable unit entity at a tile position, or null. */
export const getControllableUnitAt = (state: GameState, pos: Position): Entity | null => {
  const entities = state.world.spatial.at(pos.x, pos.y)
  for (const eid of entities) {
    if (!isControllableUnit(state, eid)) continue
    const ez = state.world.getComponent(eid, ComponentType.EntityZone)
    if (ez?.zone !== state.currentZone) continue
    return eid
  }
  return null
}

/** Find all controllable units whose positions fall within a tile rectangle. */
export const getControllableUnitsInRect = (
  state: GameState,
  topLeft: Position,
  bottomRight: Position
): Entity[] => {
  const result: Entity[] = []
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
    if (!isControllableUnit(state, eid)) continue
    const ez = state.world.getComponent(eid, ComponentType.EntityZone)
    if (ez?.zone !== state.currentZone) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    if (pos.x >= topLeft.x && pos.x <= bottomRight.x && pos.y >= topLeft.y && pos.y <= bottomRight.y) {
      result.push(eid)
    }
  }
  return result
}

/** Select a single unit, replacing the current selection. */
export const selectUnit = (state: GameState, eid: Entity): void => {
  state.selectedUnits.clear()
  state.playerSelected = false
  state.selectedUnits.add(eid)
}

/** Select multiple units, replacing the current selection. */
export const selectUnits = (state: GameState, eids: Entity[]): void => {
  state.selectedUnits.clear()
  state.playerSelected = false
  for (const eid of eids) {
    state.selectedUnits.add(eid)
  }
}

/** Select only the player, clearing any NPC selections. */
export const selectPlayer = (state: GameState): void => {
  state.selectedUnits.clear()
  state.playerSelected = true
}

/**
 * Commit a drag-box selection atomically.
 * Replaces the current selection with the given NPC units and player flag.
 */
export const commitBoxSelection = (
  state: GameState,
  eids: Entity[],
  includePlayer: boolean
): void => {
  state.selectedUnits.clear()
  state.playerSelected = includePlayer
  for (const eid of eids) {
    state.selectedUnits.add(eid)
  }
}

/** Deselect all units and the player. */
export const deselectAll = (state: GameState): void => {
  state.selectedUnits.clear()
  state.playerSelected = false
}

/** Check if any units or the player are currently selected. */
export const hasSelection = (state: GameState): boolean =>
  state.selectedUnits.size > 0 || state.playerSelected

/** Check if the player's tile falls within a rectangle (inclusive). */
export const isPlayerInRect = (
  state: GameState,
  topLeft: Position,
  bottomRight: Position
): boolean =>
  state.player.x >= topLeft.x &&
  state.player.x <= bottomRight.x &&
  state.player.y >= topLeft.y &&
  state.player.y <= bottomRight.y

/** Get positions of all selected units (for rendering highlights). */
export const getSelectedUnitPositions = (state: GameState): Map<string, Entity> => {
  const positions = new Map<string, Entity>()
  for (const eid of state.selectedUnits) {
    if (!state.world.isAlive(eid)) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    positions.set(posKey(pos.x, pos.y), eid)
  }
  return positions
}

/** Check if the player's current tile should render the selection highlight. */
export const isPlayerSelectionHighlighted = (state: GameState): boolean =>
  state.playerSelected

/** Clean up selection — remove dead entities. */
export const pruneSelection = (state: GameState): void => {
  for (const eid of state.selectedUnits) {
    if (!state.world.isAlive(eid)) {
      state.selectedUnits.delete(eid)
    }
  }
}
