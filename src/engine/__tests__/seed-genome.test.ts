import { ComponentType } from '../ecs/types'
import { dropItem, pickUpGroundItems } from '../entities'
import { FLORA_SPECIES } from '../flora/species'
import { nameToSeed } from '../genesis'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { placeItem } from '../inventory'
import { posKey } from '../position'
import { FloraSpecies, FloraStage, TileType } from '../types'
import { clearAroundPlayer, createTestState, getGroundItemEntities } from './helpers'
import { describe, expect, it } from 'vitest'

import type { FloraGenome } from '../genetics'
import type { GameState } from '../types'

const makeWildflowerGenome = (state: GameState): FloraGenome => {
  const genesisSeed = nameToSeed(state.stewardName)
  const identity = generateGenesisIdentity(
    FLORA_SPECIES[FloraSpecies.Wildflower].latinBinomial,
    genesisSeed,
    'ruin:0:vault:0'
  )
  return { identity, traits: generateTraitBag(identity) }
}

// Spawn a wildflower-seed ground item adjacent to the player carrying the
// supplied genome. Mirrors the shape spawnRuinGroundItem produces in
// ruins.ts so the pickup path is exercised identically.
const spawnSeedDrop = (state: GameState, definitionId: string, x: number, y: number, genome: FloraGenome) => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.ItemDrop, { definitionId, genome })
  state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
  return e
}

describe('seedGenomes side-table', () => {
  it('initializes empty on a fresh game state', () => {
    const state = createTestState()
    expect(state.seedGenomes.size).toBe(0)
  })
})

describe('seed pickup transfers genome to seedGenomes', () => {
  it('writes the genome under the new item uid on pickup', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const genome = makeWildflowerGenome(state)
    spawnSeedDrop(state, 'wildflowerSeeds', state.player.x, state.player.y, genome)

    pickUpGroundItems(state, 0)

    const picked = state.backpack.items.find(i => i.definitionId === 'wildflowerSeeds')
    expect(picked).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const stored = state.seedGenomes.get(picked!.uid)
    expect(stored).toEqual(genome)
  })

  it('does not touch seedGenomes for non-seed pickups', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    // Use the same helper without a genome — exercises the optional path.
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: state.player.x, y: state.player.y })
    state.world.addComponent(e, ComponentType.ItemDrop, { definitionId: 'clover' })
    state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')

    pickUpGroundItems(state, 0)
    expect(state.seedGenomes.size).toBe(0)
  })
})

describe('seed planting (drop-on-dirt)', () => {
  it('plants a wildflower at stage Healthy with the seed genome on the first adjacent Dirt tile', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const genome = makeWildflowerGenome(state)
    const seedItem = placeItem(state.backpack, 'wildflowerSeeds', 0, 0)
    expect(seedItem).not.toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    state.seedGenomes.set(seedItem!.uid, genome)

    const result = dropItem(state, 'wildflowerSeeds', 0)
    expect(result).toBe(true)

    // DROP_DELTAS order: N first. The Dirt tile to the north should now
    // be Flora.
    const tx = state.player.x
    const ty = state.player.y - 1
    expect(state.map[ty][tx].type).toBe(TileType.Flora)

    const entry = state.floraLifecycle.get(posKey(tx, ty))
    expect(entry).toBeDefined()
    expect(entry?.species).toBe(FloraSpecies.Wildflower)
    expect(entry?.stage).toBe(FloraStage.Healthy)
    expect(entry?.identity).toBe(genome.identity)
    expect(entry?.traits).toEqual(genome.traits)

    // Inventory and side-table are both drained.
    expect(state.backpack.items.find(i => i.definitionId === 'wildflowerSeeds')).toBeUndefined()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(state.seedGenomes.has(seedItem!.uid)).toBe(false)
  })

  it('plants tall grass with the tall-grass species', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const genesisSeed = nameToSeed(state.stewardName)
    const identity = generateGenesisIdentity(
      FLORA_SPECIES[FloraSpecies.TallGrass].latinBinomial,
      genesisSeed,
      'ruin:0:vault:0'
    )
    const genome: FloraGenome = { identity, traits: generateTraitBag(identity) }
    const seedItem = placeItem(state.backpack, 'tallGrassSeeds', 0, 0)
    expect(seedItem).not.toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    state.seedGenomes.set(seedItem!.uid, genome)

    expect(dropItem(state, 'tallGrassSeeds', 0)).toBe(true)
    const tx = state.player.x
    const ty = state.player.y - 1
    expect(state.floraLifecycle.get(posKey(tx, ty))?.species).toBe(FloraSpecies.TallGrass)
  })

  it('fails when there is no adjacent Dirt tile', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    // Replace every tile in DROP_DELTAS with Flora — non-Dirt walkable.
    const deltas = [
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
    for (const d of deltas) {
      state.map[state.player.y + d.y][state.player.x + d.x] = { type: TileType.Flora }
    }

    const genome = makeWildflowerGenome(state)
    const seedItem = placeItem(state.backpack, 'wildflowerSeeds', 0, 0)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    state.seedGenomes.set(seedItem!.uid, genome)

    expect(dropItem(state, 'wildflowerSeeds', 0)).toBe(false)
    // Seed and side-table entry both preserved.
    expect(state.backpack.items.find(i => i.definitionId === 'wildflowerSeeds')).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(state.seedGenomes.has(seedItem!.uid)).toBe(true)
  })

  it('fails when the seed has no side-table genome (defensive)', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    // Seed in pack, but no entry in state.seedGenomes — shouldn't happen
    // by construction, but the planting path must refuse rather than
    // crash.
    placeItem(state.backpack, 'wildflowerSeeds', 0, 0)
    expect(dropItem(state, 'wildflowerSeeds', 0)).toBe(false)
    expect(state.backpack.items.find(i => i.definitionId === 'wildflowerSeeds')).toBeDefined()
  })

  it('does not produce a ground item — seeds cannot be set down', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const genome = makeWildflowerGenome(state)
    const seedItem = placeItem(state.backpack, 'wildflowerSeeds', 0, 0)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    state.seedGenomes.set(seedItem!.uid, genome)

    const before = getGroundItemEntities(state).length
    dropItem(state, 'wildflowerSeeds', 0)
    const after = getGroundItemEntities(state).length
    expect(after).toBe(before)
  })

  it('non-seed drops still produce ground items (no regression)', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', 0, 0)
    const result = dropItem(state, 'clover', 0)
    expect(result).toBe(true)
    expect(getGroundItemEntities(state)).toHaveLength(1)
  })
})

describe('vault-spawn genome determinism', () => {
  it('two states with the same steward name derive the same wildflower-vault genome', () => {
    const a = createTestState()
    const b = createTestState()
    expect(a.stewardName).toBe(b.stewardName)
    const ga = makeWildflowerGenome(a)
    const gb = makeWildflowerGenome(b)
    expect(ga.identity).toBe(gb.identity)
    expect(ga.traits).toEqual(gb.traits)
  })
})
