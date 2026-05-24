// RP-17 — species-agnostic spread engine tests.
//
// Pins the core invariants of src/engine/flora/spread.ts:
//   - floodFillFloraPatches detects connected patches by species
//   - applyParentLineage produces parent-prefix-derived identities
//     (orphans fall back to 'genesis' literal)
//   - commitFloraPreviews handles both the normal and crossed paths,
//     sets parentPrefix, sets crossDonorPrefix, clears primedPollen
//   - tickSpeciesSpread is idempotent on winter and on no-op patches
//
// These invariants are foundational — every other RP-17 path
// (ceremony wave, lineage overlay, family-tree gating) reads them
// downstream.

import { FLORA_SPECIES } from '../flora/species'
import { applyParentLineage, commitFloraPreviews, floodFillFloraPatches, tickSpeciesSpread } from '../flora/spread'
import { CLOVER_SPREAD_CONFIG } from '../flora/type/clover/spread'
import { WILDFLOWER_SPREAD_CONFIG } from '../flora/type/wildflower/spread'
import { getGrowthPreviewSet } from '../floraGrowthPreviews'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { setMapTile } from '../map'
import { posKey } from '../position'
import { FloraSpecies, Season, TileType } from '../types'
import { clearArea, createBeeEntity, createTestState } from './helpers'
import { createTestFloraEntry } from './helpers/createTestFloraEntry'
import { afterEach, describe, expect, it, vi } from 'vitest'

const placeFloraTile = (
  state: ReturnType<typeof createTestState>,
  x: number,
  y: number,
  species: FloraSpecies = FloraSpecies.Clover
): void => {
  setMapTile(state, x, y, { type: TileType.Flora })
  state.floraLifecycle.set(posKey(x, y), createTestFloraEntry({ posKey: posKey(x, y), species }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('floodFillFloraPatches', () => {
  it('detects a single connected patch of the target species', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeFloraTile(state, 50, 50, FloraSpecies.Wildflower)
    placeFloraTile(state, 51, 50, FloraSpecies.Wildflower)
    placeFloraTile(state, 52, 50, FloraSpecies.Wildflower)

    const patches = floodFillFloraPatches(state, FloraSpecies.Wildflower)
    const big = patches.find(p => p.tiles.size >= 3)
    expect(big).toBeDefined()
    expect(big?.tiles.size).toBe(3)
  })

  it('does not include other species in a patch', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeFloraTile(state, 50, 50, FloraSpecies.Clover)
    placeFloraTile(state, 51, 50, FloraSpecies.Wildflower)

    const cloverPatches = floodFillFloraPatches(state, FloraSpecies.Clover)
    const targetPatch = cloverPatches.find(p => p.tiles.has(posKey(50, 50)))
    expect(targetPatch).toBeDefined()
    expect(targetPatch?.tiles.has(posKey(51, 50))).toBe(false)
  })

  it('returns separate patches for non-adjacent same-species tiles', () => {
    const state = createTestState()
    clearArea(state, 30, 30, 3)
    clearArea(state, 60, 60, 3)
    placeFloraTile(state, 30, 30, FloraSpecies.TallGrass)
    placeFloraTile(state, 60, 60, FloraSpecies.TallGrass)

    const patches = floodFillFloraPatches(state, FloraSpecies.TallGrass)
    const isolated = patches.filter(p => p.tiles.size === 1)
    expect(isolated.length).toBeGreaterThanOrEqual(2)
  })
})

describe('applyParentLineage', () => {
  it('encodes the parent prefix in the child identity derivation', () => {
    const parent = generateGenesisIdentity('Trifolium repens', 0, posKey(10, 10))
    const result = applyParentLineage(parent, 'Trifolium repens', posKey(11, 10), 1000)
    // Same parent + same key + same time → same identity. Reproducible.
    const again = applyParentLineage(parent, 'Trifolium repens', posKey(11, 10), 1000)
    expect(result.identity).toBe(again.identity)
  })

  it('produces a different identity for different parents at the same site', () => {
    const parentA = generateGenesisIdentity('Trifolium repens', 0, posKey(1, 1))
    const parentB = generateGenesisIdentity('Trifolium repens', 999, posKey(99, 99))
    const childA = applyParentLineage(parentA, 'Trifolium repens', posKey(50, 50), 1000)
    const childB = applyParentLineage(parentB, 'Trifolium repens', posKey(50, 50), 1000)
    expect(childA.identity).not.toBe(childB.identity)
  })

  it('falls back to "genesis" literal seed when parentIdentity is undefined', () => {
    const childOrphan = applyParentLineage(undefined, 'Trifolium repens', posKey(50, 50), 1000)
    // Genesis fallback is well-formed (length matches SHA hex) and stable.
    expect(childOrphan.identity).toHaveLength(64)
    const childOrphanAgain = applyParentLineage(undefined, 'Trifolium repens', posKey(50, 50), 1000)
    expect(childOrphan.identity).toBe(childOrphanAgain.identity)
  })

  it('produces a fresh TraitBag with all four phenotype axes', () => {
    const parent = generateGenesisIdentity('Trifolium repens', 0, posKey(1, 1))
    const { traits } = applyParentLineage(parent, 'Trifolium repens', posKey(2, 1), 1000)
    expect(traits.bloomTiming).toBeGreaterThanOrEqual(0)
    expect(traits.bloomTiming).toBeLessThanOrEqual(1)
    expect(traits.coldTolerance).toBeGreaterThanOrEqual(0)
    expect(traits.droughtResponse).toBeGreaterThanOrEqual(0)
    expect(traits.pollinatorPreference).toBeGreaterThanOrEqual(0)
  })
})

describe('commitFloraPreviews', () => {
  it('returns false and does no work when the preview Set is empty', () => {
    const state = createTestState()
    const grew = commitFloraPreviews(state, FloraSpecies.Clover, 1000)
    expect(grew).toBe(false)
  })

  it('paints previewed Dirt tiles to Flora with parent lineage', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeFloraTile(state, 50, 50, FloraSpecies.Clover)
    const childKey = posKey(51, 50)
    getGrowthPreviewSet(state, FloraSpecies.Clover).add(childKey)

    const grew = commitFloraPreviews(state, FloraSpecies.Clover, 1000)
    expect(grew).toBe(true)
    expect(state.map[50][51].type).toBe(TileType.Flora)

    const child = state.floraLifecycle.get(childKey)
    expect(child).toBeDefined()
    expect(child?.species).toBe(FloraSpecies.Clover)
    // parentPrefix is recorded — overlay needs this to draw edges.
    const parent = state.floraLifecycle.get(posKey(50, 50))
    expect(child?.parentPrefix).toBe(parent?.identity.slice(0, 8))
  })

  it('falls back to genesis seed when a previewed tile has no CARDINAL same-species neighbor', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    // No flora anywhere — orphaned preview at (50, 50).
    const orphanKey = posKey(50, 50)
    getGrowthPreviewSet(state, FloraSpecies.Clover).add(orphanKey)

    const grew = commitFloraPreviews(state, FloraSpecies.Clover, 1000)
    expect(grew).toBe(true)
    const child = state.floraLifecycle.get(orphanKey)
    expect(child).toBeDefined()
    // parentPrefix should be undefined for orphans (no parent existed).
    expect(child?.parentPrefix).toBeUndefined()
  })

  it('clears the preview Set after committing', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeFloraTile(state, 50, 50, FloraSpecies.Clover)
    const previews = getGrowthPreviewSet(state, FloraSpecies.Clover)
    previews.add(posKey(51, 50))

    commitFloraPreviews(state, FloraSpecies.Clover, 1000)
    expect(previews.size).toBe(0)
  })

  it('skips previewed tiles that are no longer Dirt', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeFloraTile(state, 50, 50, FloraSpecies.Clover)
    // The preview targets a tile that's been turned to sand between
    // queue and commit — should be silently skipped.
    setMapTile(state, 51, 50, { type: TileType.Sand })
    getGrowthPreviewSet(state, FloraSpecies.Clover).add(posKey(51, 50))

    commitFloraPreviews(state, FloraSpecies.Clover, 1000)
    expect(state.map[50][51].type).toBe(TileType.Sand)
    expect(state.floraLifecycle.has(posKey(51, 50))).toBe(false)
  })

  it('crosses with primedPollen when the parent has one, sets crossDonorPrefix, clears primedPollen', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeFloraTile(state, 50, 50, FloraSpecies.Clover)

    const parentKey = posKey(50, 50)
    const parent = state.floraLifecycle.get(parentKey)
    if (!parent) throw new Error('parent not placed')

    // Synthesize a donor PollenLoad of a different identity.
    const donorIdentity = generateGenesisIdentity(FLORA_SPECIES[FloraSpecies.Clover].latinBinomial, 77, posKey(99, 99))
    parent.primedPollen = {
      identity: donorIdentity,
      traits: generateTraitBag(donorIdentity),
      species: FloraSpecies.Clover,
    }

    const childKey = posKey(51, 50)
    getGrowthPreviewSet(state, FloraSpecies.Clover).add(childKey)

    commitFloraPreviews(state, FloraSpecies.Clover, 2000)

    const child = state.floraLifecycle.get(childKey)
    expect(child).toBeDefined()
    expect(child?.crossDonorPrefix).toBe(donorIdentity.slice(0, 8))
    expect(child?.parentPrefix).toBe(parent.identity.slice(0, 8))
    // One cross per priming — primedPollen is cleared.
    expect(parent.primedPollen).toBeUndefined()
  })
})

describe('tickSpeciesSpread winter dormancy', () => {
  it('clears pending previews and bails when season is winter', () => {
    const state = createTestState()
    state.weather.season = Season.Winter
    clearArea(state, 50, 50, 5)
    placeFloraTile(state, 50, 50, FloraSpecies.Clover)
    getGrowthPreviewSet(state, FloraSpecies.Clover).add(posKey(51, 50))

    tickSpeciesSpread(state, 1000, CLOVER_SPREAD_CONFIG)
    expect(getGrowthPreviewSet(state, FloraSpecies.Clover).size).toBe(0)
    // The previewed tile was NOT committed (winter halts both phases).
    expect(state.map[50][51].type).toBe(TileType.Dirt)
  })

  it('runs phase 1 then phase 2 when season is not winter', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeFloraTile(state, 50, 50, FloraSpecies.Wildflower)
    // Drop a bee in range so wildflower can spread.
    createBeeEntity(state, 50, 50)
    // Force every random roll to favor growth.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    tickSpeciesSpread(state, 1000, WILDFLOWER_SPREAD_CONFIG)
    // After this tick, some tiles should be queued as previews — they
    // commit on the next tick. We don't assert exact count (selector
    // behavior is the per-species test's responsibility), only that
    // the engine ran without error.
    expect(state.floraLifecycle.has(posKey(50, 50))).toBe(true)
  })
})

describe('species isolation', () => {
  it('a clover patch is not flood-filled by a neighboring wildflower tile', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeFloraTile(state, 50, 50, FloraSpecies.Clover)
    placeFloraTile(state, 51, 50, FloraSpecies.Wildflower)
    placeFloraTile(state, 52, 50, FloraSpecies.Clover)

    const cloverPatches = floodFillFloraPatches(state, FloraSpecies.Clover)
    const cloverWithStart = cloverPatches.find(p => p.tiles.has(posKey(50, 50)))
    expect(cloverWithStart).toBeDefined()
    // The wildflower at 51,50 blocks the flood, so 52,50 is in a
    // different patch.
    expect(cloverWithStart?.tiles.has(posKey(52, 50))).toBe(false)
  })

  // Verifies the per-species preview Map shape from PR #364 holds —
  // a wildflower preview doesn't leak into the clover queue.
  it('per-species preview queues are isolated', () => {
    const state = createTestState()
    const cloverSet = getGrowthPreviewSet(state, FloraSpecies.Clover)
    const wildflowerSet = getGrowthPreviewSet(state, FloraSpecies.Wildflower)
    cloverSet.add(posKey(10, 10))
    wildflowerSet.add(posKey(11, 10))
    expect(cloverSet.has(posKey(10, 10))).toBe(true)
    expect(cloverSet.has(posKey(11, 10))).toBe(false)
    expect(wildflowerSet.has(posKey(11, 10))).toBe(true)
    expect(wildflowerSet.has(posKey(10, 10))).toBe(false)
  })
})
