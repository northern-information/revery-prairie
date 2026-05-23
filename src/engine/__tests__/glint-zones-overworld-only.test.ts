import { describe, expect, it } from 'vitest'

import { SPACE_BORDER } from '../constants'
import { seedGlintPatches, spawnGlintPatch, tickGlintZones } from '../glintZones'
import { enterHouseAtTenureStart } from '../state'
import { Zone } from '../types'

import { clearArea, createTestState } from './helpers'

describe('glint patches use overworld map regardless of state.map pointer', () => {
  it('seedGlintPatches does not throw when state.map is the house interior', () => {
    const state = createTestState()
    clearArea(state, 85, 47, 40)
    enterHouseAtTenureStart(state)
    expect(state.currentZone).toBe(Zone.HouseInterior)
    expect(state.mapHeight).toBeLessThan(SPACE_BORDER * 2)

    expect(() => {
      seedGlintPatches(state, 1000)
    }).not.toThrow()
  })

  it('seedGlintPatches centers all patches inside the overworld map bounds', () => {
    const state = createTestState()
    clearArea(state, 85, 47, 40)
    enterHouseAtTenureStart(state)

    seedGlintPatches(state, 1000)

    for (const patch of state.glintPatches) {
      expect(patch.centerX).toBeGreaterThanOrEqual(SPACE_BORDER)
      expect(patch.centerX).toBeLessThan(state.overworldMapWidth - SPACE_BORDER)
      expect(patch.centerY).toBeGreaterThanOrEqual(SPACE_BORDER)
      expect(patch.centerY).toBeLessThan(state.overworldMapHeight - SPACE_BORDER)
    }
  })

  it('spawnGlintPatch reads overworld dimensions even when state.map is small', () => {
    const state = createTestState()
    clearArea(state, 85, 47, 40)
    enterHouseAtTenureStart(state)

    expect(() => {
      for (let i = 0; i < 20; i++) spawnGlintPatch(state, 1000 + i)
    }).not.toThrow()
  })

  it('tickGlintZones drifts patches on the overworld grid when state.currentZone is HouseInterior', () => {
    const state = createTestState()
    clearArea(state, 85, 47, 40)
    seedGlintPatches(state, 0)
    expect(state.glintPatches.length).toBeGreaterThan(0)

    enterHouseAtTenureStart(state)
    expect(state.currentZone).toBe(Zone.HouseInterior)

    expect(() => {
      tickGlintZones(state, 1_000_000)
    }).not.toThrow()
  })
})
