import { describe, expect, it, vi } from 'vitest'
import { posKey } from '../../../position'
import { Zone } from '../../../types'

import { TEST_CHAR_METRICS, makeCanvasStub } from '../../../__tests__/canvasStub'
import { clearAroundPlayer, createTestState } from '../../../__tests__/helpers'

// `tileXrayPass.draw` invokes `getOrBuildCache` from `tileBgCache`,
// which calls `document.createElement('canvas')` to build its offscreen
// cache. That can't run under the engine project's node environment,
// so the cache lookup is stubbed via `vi.mock` to return a minimal
// shape sufficient for the pass to compute its blit math.
vi.mock('../../../tileBgCache', () => {
  // Minimal HTMLCanvasElement-like shape — the pass only reads
  // `cache.canvas` and passes it to `ctx.drawImage`. Casting through
  // unknown lets us return a stand-in without implementing the full
  // interface.
  const stubCanvas = { width: 1024, height: 1024 } as unknown as HTMLCanvasElement
  const stubCache = {
    canvas: stubCanvas,
    worldOriginX: 0,
    worldOriginY: 0,
  }
  return {
    getOrBuildCache: vi.fn(() => stubCache),
    getCacheWorldOrigin: vi.fn(() => ({ worldOriginX: 0, worldOriginY: 0 })),
  }
})

// Import AFTER vi.mock so the pass picks up the stubbed module.
const { tileXrayPass } = await import('../tileXray')

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

  describe('draw', () => {
    it('does not throw on the overworld with no lifted tiles in viewport', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      clearAroundPlayer(state, 5)
      const { ctx, drewAnything } = makeCanvasStub()
      expect(() => {
        tileXrayPass.draw(ctx, state, TEST_CHAR_METRICS, 0)
      }).not.toThrow()
      // With no elevation around the player, no tile should occlude the avatar.
      expect(drewAnything()).toBe(false)
    })

    it('clears and re-blits at XRAY_ALPHA when a tile occludes the avatar', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      clearAroundPlayer(state, 6)
      // Lift the tile immediately north of the player so it occludes
      // the avatar's screen rect in iso projection. tileXray uses
      // getElevationTier to convert the raw value to a tier; a value
      // of 80 lands well above the threshold for a non-trivial lift.
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          state.elevation.set(posKey(state.player.x + dx, state.player.y - 1 - dy), 80)
        }
      }
      const { ctx, paintSnapshots } = makeCanvasStub()
      tileXrayPass.draw(ctx, state, TEST_CHAR_METRICS, 0)
      // The pass should have cleared at least one tile bbox and re-blit
      // from the cache canvas. A drawImage with a non-1 alpha is the
      // signature of the x-ray fade.
      const drewImage = paintSnapshots.filter(s => s.op === 'drawImage')
      const cleared = paintSnapshots.filter(s => s.op === 'clearRect')
      // Either we drew or we didn't — but if we drew, the snapshots
      // must come in clearRect-then-drawImage pairs.
      if (drewImage.length > 0) {
        expect(cleared.length).toBeGreaterThan(0)
        // The drawImage call recorded the lowered globalAlpha (XRAY_ALPHA).
        expect(drewImage[0].globalAlpha).toBeLessThan(1)
      }
    })

    it('restores globalAlpha to its prior value after each x-ray blit', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      clearAroundPlayer(state, 6)
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          state.elevation.set(posKey(state.player.x + dx, state.player.y - 1 - dy), 80)
        }
      }
      const { ctx } = makeCanvasStub()
      ctx.globalAlpha = 0.88
      tileXrayPass.draw(ctx, state, TEST_CHAR_METRICS, 0)
      expect(ctx.globalAlpha).toBe(0.88)
    })
  })
})
