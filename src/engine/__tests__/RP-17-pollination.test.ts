// RP-17 — bee-mediated pollination tests.
//
// Pins the four edge_cases the spec lists as load-bearing:
//   - capacity overflow → LIFO eviction (oldest dropped, newest pushed)
//   - same-identity revisit → no-op (no push, no prime)
//   - hive adjacency Chebyshev-1 → bag empties; distance 2 → bag retained
//   - cross-species bag mixing → matching-species prime only
//   - prime priority → most-recently-pushed matching load wins

import { POLLEN_BAG_CAPACITY } from '../constants'
import { ComponentType } from '../ecs/types'
import { setMapTile } from '../map'
import { tickPollination } from '../beePollination'
import { posKey } from '../position'
import { FloraSpecies, TileType, Zone } from '../types'

import { createTestFloraEntry } from './helpers/createTestFloraEntry'
import { clearAroundPlayer, createBeeEntity, createBeehiveEntity, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { PollenLoad } from '../types'

const placeFloraTileAt = (
  state: ReturnType<typeof createTestState>,
  x: number,
  y: number,
  species: FloraSpecies,
  identitySuffix: string,
): void => {
  setMapTile(state, x, y, { type: TileType.Flora })
  // Synthesize a distinct identity by passing the suffix as posKey to the
  // helper — every test tile gets its own identity even if x/y collide.
  state.floraLifecycle.set(
    posKey(x, y),
    createTestFloraEntry({ posKey: identitySuffix, species }),
  )
}

const getBag = (state: ReturnType<typeof createTestState>, eid: number): { loads: PollenLoad[] } => {
  const bag = state.world.getComponent(eid, ComponentType.PollenBag)
  if (!bag) throw new Error('bee missing PollenBag')
  return bag
}

describe('PollenBag pickup', () => {
  it('pushes a load when a bee lands on a Flora tile and the bag top differs', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bee = createBeeEntity(state, 50, 50, Zone.Overworld)
    placeFloraTileAt(state, 50, 50, FloraSpecies.Clover, 'A')

    tickPollination(state)
    const bag = getBag(state, bee)
    expect(bag.loads).toHaveLength(1)
    expect(bag.loads[0].species).toBe(FloraSpecies.Clover)
  })

  it('does not push when a bee revisits a tile whose (species, identity) matches the bag top', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bee = createBeeEntity(state, 50, 50, Zone.Overworld)
    placeFloraTileAt(state, 50, 50, FloraSpecies.Clover, 'A')

    tickPollination(state)
    const bag = getBag(state, bee)
    const snapshot = [...bag.loads]

    // Re-run the tick on the same tile — bag should be byte-identical.
    tickPollination(state)
    expect(bag.loads).toHaveLength(snapshot.length)
    expect(bag.loads[0].identity).toBe(snapshot[0].identity)
  })

  it('evicts the oldest load when the bag is at capacity (LIFO)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 20)
    const bee = createBeeEntity(state, 50, 50, Zone.Overworld)

    // Pre-fill bag to capacity with distinct loads.
    const bag = getBag(state, bee)
    for (let i = 0; i < POLLEN_BAG_CAPACITY; i++) {
      const tile = createTestFloraEntry({ posKey: `seed-${String(i)}`, species: FloraSpecies.Clover })
      bag.loads.push({ identity: tile.identity, traits: tile.traits, species: FloraSpecies.Clover })
    }
    const oldestIdentity = bag.loads[0].identity

    // Land bee on a fresh tile.
    placeFloraTileAt(state, 50, 50, FloraSpecies.Clover, 'unique-fresh')
    tickPollination(state)

    expect(bag.loads).toHaveLength(POLLEN_BAG_CAPACITY)
    // The oldest load has been evicted; the newest is at the end.
    expect(bag.loads[0].identity).not.toBe(oldestIdentity)
    expect(bag.loads[bag.loads.length - 1].species).toBe(FloraSpecies.Clover)
  })

  it('allows cross-species mixing in a single bag', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bee = createBeeEntity(state, 50, 50, Zone.Overworld)

    placeFloraTileAt(state, 50, 50, FloraSpecies.Clover, 'C1')
    tickPollination(state)

    setMapTile(state, 50, 50, { type: TileType.Dirt })
    state.floraLifecycle.delete(posKey(50, 50))
    placeFloraTileAt(state, 50, 50, FloraSpecies.Wildflower, 'W1')
    tickPollination(state)

    const bag = getBag(state, bee)
    const speciesInBag = new Set(bag.loads.map(l => l.species))
    expect(speciesInBag.has(FloraSpecies.Clover)).toBe(true)
    expect(speciesInBag.has(FloraSpecies.Wildflower)).toBe(true)
  })
})

describe('PollenBag prime', () => {
  it('sets primedPollen on the tile when bag has matching-species different-identity load', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bee = createBeeEntity(state, 51, 50, Zone.Overworld)

    // Tile A — bee picks up first.
    placeFloraTileAt(state, 51, 50, FloraSpecies.Clover, 'A')
    tickPollination(state)

    // Move bee to tile B (different identity, same species).
    const beePos = state.world.getComponent(bee, ComponentType.Position)
    if (!beePos) throw new Error('bee missing position')
    beePos.x = 52
    beePos.y = 50
    placeFloraTileAt(state, 52, 50, FloraSpecies.Clover, 'B')
    tickPollination(state)

    const tileB = state.floraLifecycle.get(posKey(52, 50))
    expect(tileB?.primedPollen).toBeDefined()
    // The donor is tile A's load, not tile B's own identity.
    expect(tileB?.primedPollen?.identity).not.toBe(tileB?.identity)
  })

  it('most-recently-pushed matching load wins as primedPollen', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bee = createBeeEntity(state, 50, 50, Zone.Overworld)
    const bag = getBag(state, bee)

    // Pre-load bag with two clover loads in known order.
    const oldLoad = createTestFloraEntry({ posKey: 'OLD', species: FloraSpecies.Clover })
    const newLoad = createTestFloraEntry({ posKey: 'NEW', species: FloraSpecies.Clover })
    bag.loads.push({ identity: oldLoad.identity, traits: oldLoad.traits, species: FloraSpecies.Clover })
    bag.loads.push({ identity: newLoad.identity, traits: newLoad.traits, species: FloraSpecies.Clover })

    placeFloraTileAt(state, 50, 50, FloraSpecies.Clover, 'TARGET')
    tickPollination(state)

    const tile = state.floraLifecycle.get(posKey(50, 50))
    expect(tile?.primedPollen?.identity).toBe(newLoad.identity)
  })

  it('does not prime when the bag has only the visited tiles own identity', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    createBeeEntity(state, 50, 50, Zone.Overworld)

    placeFloraTileAt(state, 50, 50, FloraSpecies.Clover, 'A')
    tickPollination(state) // pickup
    tickPollination(state) // revisit — bag top matches, no prime expected

    const tile = state.floraLifecycle.get(posKey(50, 50))
    expect(tile?.primedPollen).toBeUndefined()
  })

  it('does not prime when the bag only holds a different species', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bee = createBeeEntity(state, 50, 50, Zone.Overworld)
    const bag = getBag(state, bee)

    // Pre-load bag with a clover load.
    const cloverLoad = createTestFloraEntry({ posKey: 'C', species: FloraSpecies.Clover })
    bag.loads.push({ identity: cloverLoad.identity, traits: cloverLoad.traits, species: FloraSpecies.Clover })

    // Land bee on a wildflower tile.
    placeFloraTileAt(state, 50, 50, FloraSpecies.Wildflower, 'W')
    tickPollination(state)

    const tile = state.floraLifecycle.get(posKey(50, 50))
    expect(tile?.primedPollen).toBeUndefined()
  })
})

describe('PollenBag hive deposit', () => {
  it('empties the bag when a bee is within Chebyshev-1 of a beehive', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bee = createBeeEntity(state, 50, 50, Zone.Overworld)
    const bag = getBag(state, bee)
    const load = createTestFloraEntry({ posKey: 'X', species: FloraSpecies.Clover })
    bag.loads.push({ identity: load.identity, traits: load.traits, species: FloraSpecies.Clover })

    createBeehiveEntity(state, 51, 51) // diagonal — Chebyshev 1.
    tickPollination(state)
    expect(bag.loads).toHaveLength(0)
  })

  it('retains the bag when a bee is at Chebyshev distance 2 from a beehive', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bee = createBeeEntity(state, 50, 50, Zone.Overworld)
    const bag = getBag(state, bee)
    const load = createTestFloraEntry({ posKey: 'X', species: FloraSpecies.Clover })
    bag.loads.push({ identity: load.identity, traits: load.traits, species: FloraSpecies.Clover })

    createBeehiveEntity(state, 52, 52) // Chebyshev distance 2.
    tickPollination(state)
    expect(bag.loads).toHaveLength(1)
  })
})
