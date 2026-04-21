import { ComponentType } from './ecs/types'
import { Zone } from './types'

import type { Entity } from './ecs/types'
import type { GameState } from './types'

// Canonical EntityZone value for entities created in the current zone.
// Includes ruinIndex when currentZone is Zone.Ruin so downstream consumers
// can correctly scope entities to the specific ruin.
export const getCurrentEntityZone = (state: GameState): { zone: Zone; ruinIndex?: number } => {
  if (state.currentZone === Zone.Ruin && state.currentRuinIndex !== null) {
    return { zone: state.currentZone, ruinIndex: state.currentRuinIndex }
  }
  return { zone: state.currentZone }
}

// Strict zone membership check: an entity belongs to the current zone iff it
// has an EntityZone component, the component's zone matches state.currentZone,
// and (when in a ruin) the ruinIndex matches state.currentRuinIndex. Entities
// without an EntityZone component return false.
export const isEntityInCurrentZone = (state: GameState, eid: Entity): boolean => {
  const ez = state.world.getComponent(eid, ComponentType.EntityZone)
  if (!ez) return false
  if (ez.zone !== state.currentZone) return false
  if (state.currentZone === Zone.Ruin) {
    return ez.ruinIndex === state.currentRuinIndex
  }
  return true
}

// Zone-filtered spatial lookup. Returns only entities at (x, y) that belong
// to the current zone. Use this instead of state.world.spatial.at for any
// gameplay logic that must not see entities from other zones.
export const spatialAtInCurrentZone = (state: GameState, x: number, y: number): Entity[] => {
  const all = state.world.spatial.at(x, y)
  const result: Entity[] = []
  for (const eid of all) {
    if (isEntityInCurrentZone(state, eid)) {
      result.push(eid)
    }
  }
  return result
}
