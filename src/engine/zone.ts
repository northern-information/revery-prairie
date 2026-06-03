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

// Returns the ECS world for the given zone, creating it on demand for
// Ruin zones (non-Ruin zones are eagerly populated in createGameState
// and throw if somehow missing). Callers that need to read or mutate a
// specific zone's entities — genesis seeding into non-active zones,
// the overworld-only celestial code when running from a non-overworld
// tick — go through this helper rather than state.world (which is
// always the active zone's world).
export const getWorldForZone = (state: GameState, zone: Zone, ruinIndex?: number): World => {
  const key = worldKey(zone, ruinIndex)
  let w = state.worlds.get(key)
  if (!w) {
    if (zone !== Zone.Ruin) {
      throw new Error(`No pre-created world for non-Ruin zone ${zone}`)
    }
    w = createWorld()
    state.worlds.set(key, w)
  }
  return w
}

// Iterates every zone world and returns the union of entities matching
// the given component types. For the rare consumer that legitimately
// needs cross-zone visibility (test helpers that want a roster across
// worlds, the torchbearer's Moab lookup before he is re-homed). Most
// gameplay should use state.world.query(...) which only sees the
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

// Re-home an entity from one zone's world to another by copying every
// component and destroying the original. Entity ids are namespaced per
// world (each World maintains its own counter), so the returned id may
// differ from the input id. Used when an entity "follows" the player
// across a zone transition — coyote follows into the cave; Moab emerges
// from the cave at thaw. Any future moving NPC uses the same path. The
// caller should update any external references (state.placedCameras-
// style fields) to point at the new id.
//
// Copies every known ComponentType the source has. Unknown components
// (added by future code) will be silently dropped — keep the
// ComponentType enum in sync with the copy loop.
export const moveEntityAcrossWorlds = (sourceWorld: World, sourceEid: Entity, targetWorld: World): Entity => {
  if (sourceWorld === targetWorld) return sourceEid
  const newEid = targetWorld.createEntity()
  for (const type of Object.values(ComponentType)) {
    if (!sourceWorld.hasComponent(sourceEid, type)) continue
    const data = sourceWorld.getComponent(sourceEid, type)
    if (data === undefined) continue
    // Position is replicated into the target world's spatial index
    // automatically by addComponent. Other components are copied
    // verbatim.
    targetWorld.addComponent(newEid, type, data)
  }
  sourceWorld.destroyEntity(sourceEid)
  return newEid
}
