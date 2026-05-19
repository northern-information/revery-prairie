import { describe, expect, it, vi } from 'vitest'

import { ComponentType } from '../ecs/types'
import { tickBees } from '../entities'
import { createFloraLifecycleEntry } from '../floraLifecycleEntry'
import { FLORA_SPECIES } from '../flora/species'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { posKey } from '../position'
import { FloraSpecies, TileType } from '../types'

import { clearAroundPlayer, createBeeEntity, createTestState } from './helpers'

import type { GameState } from '../types'

const placeFloraAt = (state: GameState, x: number, y: number, species: FloraSpecies, trait = 0.5): void => {
  state.map[y][x] = { type: TileType.Flora }
  const identity = generateGenesisIdentity(FLORA_SPECIES[species].latinBinomial, 1, posKey(x, y))
  const traits = generateTraitBag(identity)
  traits.pollinatorPreference = trait
  state.floraLifecycle.set(
    posKey(x, y),
    createFloraLifecycleEntry({ time: 0, hasLight: true, species, identity, traits })
  )
}

describe('bee routing — weighted preference (precis #7)', () => {
  it('clover overwhelmingly preferred over bare ground when both are neighbors', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    // Place bee at (bx, by); clover east, bare ground in the other 7 ordinals
    const bx = state.player.x + 3
    const by = state.player.y
    placeFloraAt(state, bx + 1, by, FloraSpecies.Clover, 0.5)
    const beeEid = createBeeEntity(state, bx, by)

    // Force movement every tick. roll = 0.1 * totalWeight — should land on
    // the highest-weight slot first (clover). Use a fixed roll low enough
    // to always pick the first slot in the candidates list, then count how
    // often the bee ends up on clover after 200 ticks. With ORDINAL order
    // varying and clover being roughly 20× more attractive than bare dirt,
    // we expect well over half the bee's resting positions to be on clover.
    let cloverHits = 0
    const sequence: number[] = []
    for (let i = 0; i < 200; i++) sequence.push(0.1, i / 200)
    let idx = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const v = sequence[idx % sequence.length]
      idx += 1
      return v
    })
    try {
      for (let i = 0; i < 200; i++) {
        // reset bee to start each tick so we measure single-step decisions
        state.world.addComponent(beeEid, ComponentType.Position, { x: bx, y: by })
        tickBees(state)
        const pos = state.world.getComponent(beeEid, ComponentType.Position)
        if (pos && state.map[pos.y][pos.x].type === TileType.Flora) cloverHits += 1
      }
    } finally {
      vi.restoreAllMocks()
    }
    // Clover weight ≈ 1.0; 7 bare-ground tiles × 0.05 = 0.35; total ≈ 1.35.
    // Clover should be chosen ~74% of the time. Allow generous margin.
    expect(cloverHits).toBeGreaterThan(120)
  })

  it('non-Flora-only surroundings still allow bee to wander', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bx = state.player.x + 3
    const by = state.player.y + 3
    const beeEid = createBeeEntity(state, bx, by)

    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    try {
      tickBees(state)
    } finally {
      vi.restoreAllMocks()
    }
    const pos = state.world.getComponent(beeEid, ComponentType.Position)
    expect(pos).toBeDefined()
    if (pos) {
      const moved = pos.x !== bx || pos.y !== by
      expect(moved).toBe(true)
    }
  })

  it('does not crash when bee has no walkable neighbors', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    const bx = 50
    const by = 12
    state.map[by][bx] = { type: TileType.Dirt }
    for (const d of [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ]) {
      state.map[by + d[1]][bx + d[0]] = { type: TileType.Space }
    }
    const beeEid = createBeeEntity(state, bx, by)

    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    try {
      for (let i = 0; i < 20; i++) tickBees(state)
    } finally {
      vi.restoreAllMocks()
    }
    const pos = state.world.getComponent(beeEid, ComponentType.Position)
    expect(pos?.x).toBe(bx)
    expect(pos?.y).toBe(by)
  })

  it('wildflower attracts bees more than bare ground', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bx = state.player.x + 3
    const by = state.player.y
    placeFloraAt(state, bx + 1, by, FloraSpecies.Wildflower, 0.5)
    const beeEid = createBeeEntity(state, bx, by)

    let wildflowerHits = 0
    let dirtHits = 0
    let idx = 0
    const sequence: number[] = []
    // 200 trials, each tick uses 2 rng samples (move gate + weighted roll).
    // Use varying second value to spread the roll across the weight space.
    for (let i = 0; i < 400; i++) sequence.push(0.1, (i % 100) / 100)
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const v = sequence[idx % sequence.length]
      idx += 1
      return v
    })
    try {
      for (let i = 0; i < 200; i++) {
        state.world.addComponent(beeEid, ComponentType.Position, { x: bx, y: by })
        tickBees(state)
        const pos = state.world.getComponent(beeEid, ComponentType.Position)
        if (pos) {
          if (state.map[pos.y][pos.x].type === TileType.Flora) wildflowerHits += 1
          else if (state.map[pos.y][pos.x].type === TileType.Dirt) dirtHits += 1
        }
      }
    } finally {
      vi.restoreAllMocks()
    }
    // Wildflower weight ≈ 0.6 × (0.75 + 0.5×0.5) = 0.6 × 1.0 = 0.6
    // 7 dirt × 0.05 = 0.35. wildflower should be picked > 1.7× as often.
    expect(wildflowerHits).toBeGreaterThan(dirtHits)
  })
})

describe('isBeeNearFood — multi-species (precis #7)', () => {
  it('wildflower neighbor counts as bee food', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bx = state.player.x + 3
    const by = state.player.y
    placeFloraAt(state, bx + 1, by, FloraSpecies.Wildflower, 0.5)
    const beeEid = createBeeEntity(state, bx, by)
    // Run enough ticks to age past starvation if food was not detected;
    // the bee must still exist because wildflower is now food.
    for (let i = 0; i < 50; i++) tickBees(state)
    const pos = state.world.getComponent(beeEid, ComponentType.Position)
    expect(pos).toBeDefined()
  })

  it('tall grass neighbor counts as bee food', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bx = state.player.x + 3
    const by = state.player.y
    placeFloraAt(state, bx + 1, by, FloraSpecies.TallGrass, 0.5)
    const beeEid = createBeeEntity(state, bx, by)
    for (let i = 0; i < 50; i++) tickBees(state)
    const pos = state.world.getComponent(beeEid, ComponentType.Position)
    expect(pos).toBeDefined()
  })
})
