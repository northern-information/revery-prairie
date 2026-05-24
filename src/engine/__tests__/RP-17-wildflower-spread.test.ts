// RP-17 — wildflower spread smoke tests.
//
// Wildflower spread is pollinator-gated: no bee or monarch within
// Chebyshev-3 of a candidate Dirt neighbor → no growth. With a
// pollinator in range, the per-candidate roll fires. Winter halts
// growth like clover and tall grass.

import { setMapTile } from '../map'
import { posKey } from '../position'
import { WILDFLOWER_SPREAD_CONFIG } from '../flora/type/wildflower/spread'
import { tickSpeciesSpread } from '../flora/spread'
import { getGrowthPreviewSet } from '../floraGrowthPreviews'
import { FloraSpecies, Season, TileType } from '../types'

import { createTestFloraEntry } from './helpers/createTestFloraEntry'
import { clearArea, createBeeEntity, createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

const placeWildflower = (
  state: ReturnType<typeof createTestState>,
  x: number,
  y: number,
): void => {
  setMapTile(state, x, y, { type: TileType.Flora })
  state.floraLifecycle.set(
    posKey(x, y),
    createTestFloraEntry({ posKey: posKey(x, y), species: FloraSpecies.Wildflower }),
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('wildflower spread', () => {
  it('does not queue growth when no pollinator is within Chebyshev-3 of any neighbor', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeWildflower(state, 50, 50)
    // Force every growth roll to succeed — gating must come from
    // pollinator absence, not from a failed roll.
    vi.spyOn(Math, 'random').mockReturnValue(0)

    tickSpeciesSpread(state, 1000, WILDFLOWER_SPREAD_CONFIG)
    expect(getGrowthPreviewSet(state, FloraSpecies.Wildflower).size).toBe(0)
  })

  it('queues growth when a bee is within Chebyshev-3 of a candidate neighbor', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeWildflower(state, 50, 50)
    // Bee at 52,50 — Chebyshev 1 from the wildflower, easily within
    // range of the (51, 50) Dirt neighbor.
    createBeeEntity(state, 52, 50)

    vi.spyOn(Math, 'random').mockReturnValue(0)

    tickSpeciesSpread(state, 1000, WILDFLOWER_SPREAD_CONFIG)
    expect(getGrowthPreviewSet(state, FloraSpecies.Wildflower).size).toBeGreaterThan(0)
  })

  it('halts in winter and clears stale previews', () => {
    const state = createTestState()
    state.weather.season = Season.Winter
    clearArea(state, 50, 50, 5)
    placeWildflower(state, 50, 50)
    createBeeEntity(state, 52, 50)
    getGrowthPreviewSet(state, FloraSpecies.Wildflower).add(posKey(51, 50))

    tickSpeciesSpread(state, 1000, WILDFLOWER_SPREAD_CONFIG)
    expect(getGrowthPreviewSet(state, FloraSpecies.Wildflower).size).toBe(0)
    expect(state.map[50][51].type).toBe(TileType.Dirt)
  })
})
