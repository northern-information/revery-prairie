import { FLORA_SPECIES } from '../flora/species'
import { createFloraLifecycleEntry } from '../floraLifecycleEntry'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { resolvePhenotypeLabel } from '../phenotype'
import { posKey } from '../position'
import { FloraSpecies, TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState, PhenotypeAxis } from '../types'

const placeFloraAt = (
  state: GameState,
  x: number,
  y: number,
  species: FloraSpecies,
  trait: number,
  axis: PhenotypeAxis = 'bloomTiming'
): void => {
  state.map[y][x] = { type: TileType.Flora }
  const identity = generateGenesisIdentity(FLORA_SPECIES[species].latinBinomial, 1, posKey(x, y))
  const traits = generateTraitBag(identity)
  traits[axis] = trait
  state.floraLifecycle.set(
    posKey(x, y),
    createFloraLifecycleEntry({ time: 0, hasLight: true, species, identity, traits })
  )
}

describe('resolvePhenotypeLabel (RP-4)', () => {
  it('returns null when no flora species is discovered', () => {
    const state = createTestState()
    const result = resolvePhenotypeLabel(state, 0)
    expect(result).toBeNull()
  })

  it('selects the only discovered species', () => {
    const state = createTestState()
    state.manualDiscoveries.add('flora:wildflower')
    clearAroundPlayer(state, 5)
    placeFloraAt(state, state.player.x + 1, state.player.y, FloraSpecies.Wildflower, 0.5)
    const result = resolvePhenotypeLabel(state, 0)
    expect(result?.species).toBe(FloraSpecies.Wildflower)
  })

  it('breaks ties by enum order: clover < tallGrass < wildflower', () => {
    const state = createTestState()
    state.manualDiscoveries.add('flora:clover')
    state.manualDiscoveries.add('flora:wildflower')
    state.manualDiscoveries.add('flora:tallGrass')
    clearAroundPlayer(state, 5)
    placeFloraAt(state, state.player.x + 1, state.player.y, FloraSpecies.Clover, 0.5)
    const result = resolvePhenotypeLabel(state, 0)
    expect(result?.species).toBe(FloraSpecies.Clover)
  })

  it('cycles axes by reveryCount', () => {
    const state = createTestState()
    state.manualDiscoveries.add('flora:clover')
    clearAroundPlayer(state, 5)
    placeFloraAt(state, state.player.x + 1, state.player.y, FloraSpecies.Clover, 0.5)
    expect(resolvePhenotypeLabel(state, 0)?.axis).toBe('bloomTiming')
    expect(resolvePhenotypeLabel(state, 1)?.axis).toBe('coldTolerance')
    expect(resolvePhenotypeLabel(state, 2)?.axis).toBe('droughtResponse')
    expect(resolvePhenotypeLabel(state, 3)?.axis).toBe('pollinatorPreference')
    expect(resolvePhenotypeLabel(state, 4)?.axis).toBe('bloomTiming') // cycle
  })

  it('low-bucket verdict for trait mean < 0.33', () => {
    const state = createTestState()
    state.manualDiscoveries.add('flora:clover')
    clearAroundPlayer(state, 5)
    placeFloraAt(state, state.player.x + 1, state.player.y, FloraSpecies.Clover, 0.1, 'bloomTiming')
    const result = resolvePhenotypeLabel(state, 0)
    expect(result?.verdict).toBe('early-blooming')
  })

  it('high-bucket verdict for trait mean >= 0.67', () => {
    const state = createTestState()
    state.manualDiscoveries.add('flora:clover')
    clearAroundPlayer(state, 5)
    placeFloraAt(state, state.player.x + 1, state.player.y, FloraSpecies.Clover, 0.8, 'bloomTiming')
    const result = resolvePhenotypeLabel(state, 0)
    expect(result?.verdict).toBe('late-blooming')
  })

  it('mid-bucket verdict for trait mean in [0.33, 0.67)', () => {
    const state = createTestState()
    state.manualDiscoveries.add('flora:clover')
    clearAroundPlayer(state, 5)
    placeFloraAt(state, state.player.x + 1, state.player.y, FloraSpecies.Clover, 0.5, 'bloomTiming')
    const result = resolvePhenotypeLabel(state, 0)
    expect(result?.verdict).toBe('mid-season')
  })

  it('defaults trait mean to 0.5 (mid bucket) when no living tiles', () => {
    const state = createTestState()
    state.manualDiscoveries.add('flora:clover')
    // No floraLifecycle entries.
    const result = resolvePhenotypeLabel(state, 0)
    expect(result?.verdict).toBe('mid-season')
  })

  it('averages trait values across all living tiles of the species', () => {
    const state = createTestState()
    state.manualDiscoveries.add('flora:clover')
    clearAroundPlayer(state, 5)
    placeFloraAt(state, state.player.x + 1, state.player.y, FloraSpecies.Clover, 0.0, 'coldTolerance')
    placeFloraAt(state, state.player.x + 2, state.player.y, FloraSpecies.Clover, 0.0, 'coldTolerance')
    placeFloraAt(state, state.player.x + 3, state.player.y, FloraSpecies.Clover, 1.0, 'coldTolerance')
    // mean = (0 + 0 + 1) / 3 = 0.33 → exactly low/mid boundary → mid bucket
    const result = resolvePhenotypeLabel(state, 1)
    expect(result?.axis).toBe('coldTolerance')
    expect(result?.verdict).toBe('temperate')
  })

  it('deterministic given identical state', () => {
    const state = createTestState()
    state.manualDiscoveries.add('flora:wildflower')
    clearAroundPlayer(state, 5)
    placeFloraAt(state, state.player.x + 1, state.player.y, FloraSpecies.Wildflower, 0.5, 'pollinatorPreference')
    const a = resolvePhenotypeLabel(state, 3)
    const b = resolvePhenotypeLabel(state, 3)
    expect(a).toEqual(b)
  })
})
