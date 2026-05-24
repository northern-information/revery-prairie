// RP-17 — lineage overlay state tests.
//
// The canvas drawing in src/engine/render/passes/lineageOverlay.ts is
// exercised in playtest; here we pin the state invariants the overlay
// reads:
//   - overlayMode starts at Default
//   - the spread engine sets parentPrefix on every child entry
//   - a crossed child sets crossDonorPrefix to the donor's 8-hex prefix
//   - both prefixes match the lookup pattern the overlay uses
//     (state.floraLifecycle scan → index by entry.species and
//     entry.identity.slice(0, 8))

import { commitFloraPreviews } from '../flora/spread'
import { setMapTile } from '../map'
import { posKey } from '../position'
import { getGrowthPreviewSet } from '../floraGrowthPreviews'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { FloraSpecies, OverlayMode, TileType } from '../types'

import { createTestFloraEntry } from './helpers/createTestFloraEntry'
import { clearArea, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

const placeFlora = (
  state: ReturnType<typeof createTestState>,
  x: number,
  y: number,
  species: FloraSpecies,
  identitySuffix?: string,
): void => {
  setMapTile(state, x, y, { type: TileType.Flora })
  state.floraLifecycle.set(
    posKey(x, y),
    createTestFloraEntry({ posKey: identitySuffix ?? posKey(x, y), species }),
  )
}

describe('overlayMode default', () => {
  it('initializes to OverlayMode.Default', () => {
    const state = createTestState()
    expect(state.overlayMode).toBe(OverlayMode.Default)
  })

  it('accepts FamilyTree as a valid value', () => {
    const state = createTestState()
    state.overlayMode = OverlayMode.FamilyTree
    expect(state.overlayMode).toBe(OverlayMode.FamilyTree)
  })
})

describe('parentPrefix is set by the spread engine', () => {
  it('records parentPrefix on a child sprouted from a parent', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeFlora(state, 50, 50, FloraSpecies.Clover)

    const childKey = posKey(51, 50)
    getGrowthPreviewSet(state, FloraSpecies.Clover).add(childKey)
    commitFloraPreviews(state, FloraSpecies.Clover, 1000)

    const parent = state.floraLifecycle.get(posKey(50, 50))
    const child = state.floraLifecycle.get(childKey)
    expect(child?.parentPrefix).toBe(parent?.identity.slice(0, 8))
  })

  it('leaves parentPrefix undefined on an orphaned preview', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    // No parent flora — preview is orphaned.
    const orphanKey = posKey(50, 50)
    getGrowthPreviewSet(state, FloraSpecies.Clover).add(orphanKey)
    commitFloraPreviews(state, FloraSpecies.Clover, 1000)

    const child = state.floraLifecycle.get(orphanKey)
    expect(child?.parentPrefix).toBeUndefined()
  })
})

describe('crossDonorPrefix on crossed offspring', () => {
  it('matches the first 8 hex chars of the donor identity at cross time', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeFlora(state, 50, 50, FloraSpecies.Clover)

    const parentKey = posKey(50, 50)
    const parent = state.floraLifecycle.get(parentKey)
    if (!parent) throw new Error('parent missing')

    const donorIdentity = generateGenesisIdentity('Trifolium repens', 999, posKey(99, 99))
    parent.primedPollen = {
      identity: donorIdentity,
      traits: generateTraitBag(donorIdentity),
      species: FloraSpecies.Clover,
    }

    const childKey = posKey(51, 50)
    getGrowthPreviewSet(state, FloraSpecies.Clover).add(childKey)
    commitFloraPreviews(state, FloraSpecies.Clover, 1000)

    const child = state.floraLifecycle.get(childKey)
    expect(child?.crossDonorPrefix).toBe(donorIdentity.slice(0, 8))
  })

  it('lets the overlay locate the donor in the same-species prefix index', () => {
    const state = createTestState()
    clearArea(state, 30, 30, 30)

    // Place a donor tile elsewhere in the map.
    placeFlora(state, 30, 30, FloraSpecies.Clover, 'DONOR')
    const donor = state.floraLifecycle.get(posKey(30, 30))
    if (!donor) throw new Error('donor missing')

    // Parent next to the player.
    placeFlora(state, 50, 50, FloraSpecies.Clover, 'PARENT')
    const parent = state.floraLifecycle.get(posKey(50, 50))
    if (!parent) throw new Error('parent missing')
    parent.primedPollen = { identity: donor.identity, traits: donor.traits, species: FloraSpecies.Clover }

    const childKey = posKey(51, 50)
    getGrowthPreviewSet(state, FloraSpecies.Clover).add(childKey)
    commitFloraPreviews(state, FloraSpecies.Clover, 1000)

    const child = state.floraLifecycle.get(childKey)
    expect(child?.crossDonorPrefix).toBe(donor.identity.slice(0, 8))

    // Walk the lookup the overlay performs and confirm the donor is
    // reachable. (Same as in lineageOverlay.ts: per-species map from
    // identity-prefix → posKey, then read the prefix off the child.)
    const reverseIndex = new Map<string, string>()
    for (const [key, entry] of state.floraLifecycle) {
      if (entry.species !== FloraSpecies.Clover) continue
      const prefix = entry.identity.slice(0, 8)
      const existing = reverseIndex.get(prefix)
      if (existing === undefined || key < existing) reverseIndex.set(prefix, key)
    }
    if (child?.crossDonorPrefix === undefined) throw new Error('child has no crossDonorPrefix')
    const donorKey = reverseIndex.get(child.crossDonorPrefix)
    expect(donorKey).toBe(posKey(30, 30))
  })
})
