// Precis #17 — tall grass spread smoke tests.
//
// Tall grass is the only species that spreads without a pollinator
// dependency. The rate is the slowest of the three so it doesn't
// dominate the prairie. Winter dormancy still applies.

import { setMapTile } from '../map'
import { posKey } from '../position'
import { TALLGRASS_SPREAD_CONFIG } from '../flora/type/tallGrass/spread'
import { tickSpeciesSpread } from '../flora/spread'
import { getGrowthPreviewSet } from '../floraGrowthPreviews'
import { FloraSpecies, Season, TileType } from '../types'

import { createTestFloraEntry } from './helpers/createTestFloraEntry'
import { clearArea, createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

const placeTallGrass = (
  state: ReturnType<typeof createTestState>,
  x: number,
  y: number,
): void => {
  setMapTile(state, x, y, { type: TileType.Flora })
  state.floraLifecycle.set(
    posKey(x, y),
    createTestFloraEntry({ posKey: posKey(x, y), species: FloraSpecies.TallGrass }),
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tall grass spread', () => {
  it('queues growth without any pollinator nearby', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeTallGrass(state, 50, 50)
    // No bees or monarchs in the world — tall grass should still
    // spread because requiresPollinatorAdjacency is false.
    vi.spyOn(Math, 'random').mockReturnValue(0)

    tickSpeciesSpread(state, 1000, TALLGRASS_SPREAD_CONFIG)
    expect(getGrowthPreviewSet(state, FloraSpecies.TallGrass).size).toBeGreaterThan(0)
  })

  it('halts in winter and clears stale previews', () => {
    const state = createTestState()
    state.weather.season = Season.Winter
    clearArea(state, 50, 50, 5)
    placeTallGrass(state, 50, 50)
    getGrowthPreviewSet(state, FloraSpecies.TallGrass).add(posKey(51, 50))

    tickSpeciesSpread(state, 1000, TALLGRASS_SPREAD_CONFIG)
    expect(getGrowthPreviewSet(state, FloraSpecies.TallGrass).size).toBe(0)
  })
})
