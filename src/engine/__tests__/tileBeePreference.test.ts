import { describe, expect, it } from 'vitest'

import { createFloraLifecycleEntry } from '../floraLifecycleEntry'
import { FLORA_SPECIES, getTileBeePreference } from '../flora/species'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { posKey } from '../position'
import { FloraSpecies, TileType } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

import type { GameState } from '../types'

// Place a Flora tile at (x, y) with the given species and pollinatorPreference
// trait. Used to set up deterministic preference scenarios — we mutate the
// trait directly because we want the exact value, not whatever the SHA256
// derivation produces.
const placeFloraAt = (state: GameState, x: number, y: number, species: FloraSpecies, trait: number): void => {
  state.map[y][x] = { type: TileType.Flora }
  const identity = generateGenesisIdentity(FLORA_SPECIES[species].latinBinomial, 1, posKey(x, y))
  const traits = generateTraitBag(identity)
  traits.pollinatorPreference = trait
  state.floraLifecycle.set(
    posKey(x, y),
    createFloraLifecycleEntry({ time: 0, hasLight: true, species, identity, traits })
  )
}

describe('getTileBeePreference (RP-7)', () => {
  it('returns 0 for non-Flora tiles', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const x = state.player.x
    const y = state.player.y
    state.map[y][x] = { type: TileType.Dirt }
    expect(getTileBeePreference(state, x, y)).toBe(0)
  })

  it('returns 0 for out-of-bounds coords', () => {
    const state = createTestState()
    expect(getTileBeePreference(state, -1, 0)).toBe(0)
    expect(getTileBeePreference(state, 0, -1)).toBe(0)
    expect(getTileBeePreference(state, state.mapWidth, 0)).toBe(0)
    expect(getTileBeePreference(state, 0, state.mapHeight)).toBe(0)
  })

  it('returns 0 for a Flora tile with no lifecycle entry', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const x = state.player.x
    const y = state.player.y
    state.map[y][x] = { type: TileType.Flora }
    // intentionally do not set state.floraLifecycle entry
    expect(getTileBeePreference(state, x, y)).toBe(0)
  })

  it('returns species baseline when trait is mid-range (0.5)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const x = state.player.x + 1
    const y = state.player.y
    placeFloraAt(state, x, y, FloraSpecies.Clover, 0.5)
    // 1.0 * (0.75 + 0.5 * 0.5) = 1.0 * 1.0 = 1.0
    expect(getTileBeePreference(state, x, y)).toBeCloseTo(1.0)
  })

  it('clamps clover at trait=1.0 to 1.0 (would otherwise be 1.25)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const x = state.player.x + 1
    const y = state.player.y
    placeFloraAt(state, x, y, FloraSpecies.Clover, 1.0)
    expect(getTileBeePreference(state, x, y)).toBe(1.0)
  })

  it('returns 0.45 for wildflower at trait=0 (0.6 * 0.75)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const x = state.player.x + 1
    const y = state.player.y
    placeFloraAt(state, x, y, FloraSpecies.Wildflower, 0)
    expect(getTileBeePreference(state, x, y)).toBeCloseTo(0.45)
  })

  it('returns 0.375 for tall grass at trait=1 (0.3 * 1.25)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const x = state.player.x + 1
    const y = state.player.y
    placeFloraAt(state, x, y, FloraSpecies.TallGrass, 1)
    expect(getTileBeePreference(state, x, y)).toBeCloseTo(0.375)
  })

  it('output stays inside [0, 1] for every species at trait extremes', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const speciesList: FloraSpecies[] = [FloraSpecies.Clover, FloraSpecies.Wildflower, FloraSpecies.TallGrass]
    let offset = 1
    for (const species of speciesList) {
      for (const trait of [0, 0.5, 1]) {
        const x = state.player.x + offset
        const y = state.player.y
        placeFloraAt(state, x, y, species, trait)
        const pref = getTileBeePreference(state, x, y)
        expect(pref).toBeGreaterThanOrEqual(0)
        expect(pref).toBeLessThanOrEqual(1)
        offset += 1
      }
    }
  })
})
