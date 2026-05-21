// Precis #17 — bee-mediated pollination engine.
//
// Bees and monarchs carry a PollenBag ECS component (POLLEN_BAG_CAPACITY
// loads, LIFO eviction, cross-species mixing allowed). This module runs
// once per movement tick:
//   1. PICKUP — visiting a Flora tile pushes a PollenLoad describing
//      that tile if the bag's most-recent load doesn't already match
//      (species, identity).
//   2. PRIME — if the bag holds a load whose species matches the visited
//      tile but whose identity differs, the tile's floraLifecycle.primedPollen
//      is set to that load. The most-recently-pushed matching load wins
//      (highest index in loads). Father = the load. Mother = the tile.
//      The next time this tile commits a child via tickSpeciesSpread,
//      the child crosses with the donor and primedPollen is cleared.
//   3. HIVE DEPOSIT — bees/monarchs within Chebyshev-1 of a beehive
//      drop their entire bag. Models the bee returning to the hive.
//
// Distinct from src/engine/flora/actions/pollinate.ts which governs
// pollen-particle visual drift driven by wind; the two don't share
// state or call each other.

import { POLLEN_BAG_CAPACITY } from './constants'
import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { posKey } from './position'
import { FloraSpecies, TileType, Zone } from './types'

import type { PollenLoad } from './types'
import type { GameState } from './types'

const HIVE_ADJACENCY = 1

// Returns true if (x, y) is within Chebyshev HIVE_ADJACENCY of any
// overworld beehive entity. Hives in caves don't count — bees pollinate
// in the overworld.
const isAdjacentToHive = (state: GameState, x: number, y: number): boolean => {
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'beehive') continue
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== Zone.Overworld) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    if (Math.max(Math.abs(pos.x - x), Math.abs(pos.y - y)) <= HIVE_ADJACENCY) return true
  }
  return false
}

// Find the most-recently-pushed load of the given species in the bag.
// Returns undefined if no matching load exists. "Most recent" = highest
// index per spec; the load was pushed last by pollen-pickup.
const findMatchingLoad = (bag: { loads: PollenLoad[] }, species: FloraSpecies): PollenLoad | undefined => {
  for (let i = bag.loads.length - 1; i >= 0; i--) {
    if (bag.loads[i].species === species) return bag.loads[i]
  }
  return undefined
}

// LIFO eviction: when the bag is at capacity and a new load needs to
// push, drop the OLDEST load (index 0) and append the new one at the
// end. The "most recent" load is always at the highest index.
const pushPollenLoad = (bag: { loads: PollenLoad[] }, load: PollenLoad): void => {
  if (bag.loads.length >= POLLEN_BAG_CAPACITY) {
    bag.loads.shift()
  }
  bag.loads.push(load)
}

export const tickPollination = (state: GameState): void => {
  if (state.currentZone !== Zone.Overworld) return

  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position, ComponentType.PollenBag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'bee' && tag !== 'monarch') continue
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== Zone.Overworld) continue

    const pos = state.world.getComponent(eid, ComponentType.Position)
    const bag = state.world.getComponent(eid, ComponentType.PollenBag)
    if (!pos || !bag) continue

    // HIVE DEPOSIT first — a bee landing one tile from a hive empties
    // its bag before any pickup/prime would happen on this tick. Cheap
    // way to avoid the edge case where a hive sits next to flora.
    if (isAdjacentToHive(state, pos.x, pos.y)) {
      if (bag.loads.length > 0) bag.loads = []
      continue
    }

    const tile = state.map[pos.y]?.[pos.x]
    if (tile?.type !== TileType.Flora) continue

    const key = posKey(pos.x, pos.y)
    const entry = state.floraLifecycle.get(key)
    if (!entry) continue
    const { species, identity, traits } = entry

    // PRIME — if a matching-species load of different identity exists,
    // set primedPollen on the tile before pickup. Done first so that
    // landing on a fresh tile doesn't immediately "self-pollinate"
    // when the pickup overwrites whatever was at the bag top.
    const matching = findMatchingLoad(bag, species)
    if (matching && matching.identity !== identity) {
      const firstPrime = entry.primedPollen === undefined
      entry.primedPollen = matching
      if (firstPrime) {
        recordDiscovery(state, 'event:cross-pollinated')
      }
    }

    // PICKUP — push a new load unless the bag's top already matches
    // (species, identity). Cross-species mixing in the bag is allowed
    // (a single bag may carry clover and wildflower loads at once).
    const top = bag.loads.length > 0 ? bag.loads[bag.loads.length - 1] : undefined
    if (top?.species !== species || top.identity !== identity) {
      pushPollenLoad(bag, { identity, traits, species })
    }
  }
}
