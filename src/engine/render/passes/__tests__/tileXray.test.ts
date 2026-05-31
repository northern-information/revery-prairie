import { describe, expect, it } from 'vitest'
import { Zone } from '../../../types'
import { tileXrayPass } from '../tileXray'
import { createTestState } from '../../../__tests__/helpers'

// `tileXrayPass.draw` invokes `getOrBuildCache`, which creates an
// `OffscreenCanvas`/`HTMLCanvasElement` via `document.createElement`.
// That can't run under the engine project's node environment, so this
// suite only covers the testable surfaces: the `isActive` predicate
// and the registered pass metadata. The draw path is exercised end-to-
// end at runtime in the dev server.

describe('tileXrayPass', () => {
  describe('isActive', () => {
    it('is true on Overworld', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      expect(tileXrayPass.isActive(state)).toBe(true)
    })

    it('is false in interior zones (cave, house, ruin, yard)', () => {
      const state = createTestState()
      for (const z of [Zone.Cave, Zone.HouseInterior, Zone.Ruin, Zone.LittleHouseYard] as const) {
        state.currentZone = z
        expect(tileXrayPass.isActive(state)).toBe(false)
      }
    })
  })

  describe('pass metadata', () => {
    it('registers in the tile-xray slot with id "tile-xray"', () => {
      expect(tileXrayPass.id).toBe('tile-xray')
      expect(tileXrayPass.slot).toBe('tile-xray')
    })
  })
})
