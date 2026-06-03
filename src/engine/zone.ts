import { ComponentType } from './ecs/types'
import { createWorld } from './ecs/world'
import { Zone } from './types'

import type { Entity } from './ecs/types'
import type { World } from './ecs/world'
import type { GameState } from './types'

// Canonical string key for a zone-world lookup in state.worlds. Ruins
// are multi-instance (one map per currentRuinIndex); each ruin gets its
// own ECS world keyed by its index. Every other zone has a single world
// keyed by the Zone enum value verbatim.
export const worldKey = (zone: Zone, ruinIndex?: number): string => {
  if (zone === Zone.Ruin && ruinIndex !== undefined) return `ruin:${String(ruinIndex)}`
  return zone
}

// Canonical EntityZone value for entities created in the current zone.
// Includes ruinIndex when currentZone is Zone.Ruin so downstream consumers
// can correctly scope entities to the specific ruin.
export const getCurrentEntityZone = (state: GameState): { zone: Zone; ruinIndex?: number } => {
  if (state.currentZone === Zone.Ruin && state.currentRuinIndex !== null) {
    return { zone: state.currentZone, ruinIndex: state.currentRuinIndex }
  }
  return { zone: state.currentZone }
}

// Returns the ECS world for the given zone, creating it on demand for
// Ruin zones (non-Ruin zones are eagerly populated in createGameState
// and throw if somehow missing). Callers that need to read or mutate a
// specific zone's entities — genesis seeding into non-active zones,
// the revery cross-zone count, the overworld-only celestial code when
// running from a non-overworld tick — go through this helper rather
// than state.world (which is always the active zone's world).
export const getWorldForZone = (state: GameState, zone: Zone, ruinIndex?: number): World => {
  const key = worldKey(zone, ruinIndex)
  let w = state.worlds.get(key)
  if (!w) {
    if (zone !== Zone.Ruin) {
      throw new Error(`No pre-created world for non-Ruin zone ${String(zone)}`)
    }
    w = createWorld()
    state.worlds.set(key, w)
  }
  return w
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

// Iterates every zone world and returns the union of entities matching
// the given component types. For the rare consumer that legitimately
// needs cross-zone visibility — the revery character count (global by
// design), test helpers that want a steward roster across worlds.
// Most gameplay should use state.world.query(...) which only sees the
// active zone's entities.
//
// Each returned entry is `{ world, eid }` so the caller can read
// components from the correct world (entity ids are namespaced per
// world; the same numeric id can refer to different entities in
// different worlds).
export const queryAllZones = (
  state: GameState,
  ...types: ComponentType[]
): { world: World; eid: Entity }[] => {
  const result: { world: World; eid: Entity }[] = []
  for (const world of state.worlds.values()) {
    for (const eid of world.query(...types)) {
      result.push({ world, eid })
    }
  }
  return result
}
