import { updateCamera } from '../camera'
import { worldToScreen } from '../projection'
import { Zone } from '../types'
import { createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

// RP-69a — camera applies an iso-vertical bias by adding the same offset
// to both camera.x and camera.y, shifting the player iso-up on screen
// without horizontal drift. The bias is a fixed 3 tiles (not viewport-
// relative). Mirror the constant here so the test fixture stays in
// sync with `camera.ts`.
const CAMERA_ISO_UP_BIAS_TILES = 3
const expectedFollowX = (focusX: number, viewportWidth: number): number =>
  focusX - Math.floor(viewportWidth / 2) + CAMERA_ISO_UP_BIAS_TILES
const expectedFollowY = (focusY: number, viewportHeight: number): number =>
  focusY - Math.floor(viewportHeight / 2) + CAMERA_ISO_UP_BIAS_TILES

describe('updateCamera', () => {
  describe('follow mode (always centers player horizontally; biases player above canvas center vertically)', () => {
    it('centers camera on the player in overworld', () => {
      const state = createTestState({ viewportWidth: 40, viewportHeight: 40 })
      state.player.x = 85
      state.player.y = 47
      updateCamera(state)
      expect(state.camera.x).toBe(expectedFollowX(85, state.viewportWidth))
      expect(state.camera.y).toBe(expectedFollowY(47, state.viewportHeight))
    })

    it('centers camera on the player in cave zone', () => {
      const state = createTestState({ viewportWidth: 10, viewportHeight: 10 })
      state.currentZone = Zone.Cave
      state.player.x = 50
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(expectedFollowX(50, state.viewportWidth))
      expect(state.camera.y).toBe(expectedFollowY(12, state.viewportHeight))
    })

    it('centers camera on the player in ruin zone', () => {
      const state = createTestState({ viewportWidth: 10, viewportHeight: 10 })
      state.currentZone = Zone.Ruin
      state.player.x = 50
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(expectedFollowX(50, state.viewportWidth))
      expect(state.camera.y).toBe(expectedFollowY(12, state.viewportHeight))
    })

    it('recenters every step as the player walks (no deadzone)', () => {
      const state = createTestState({ viewportWidth: 40, viewportHeight: 40 })
      state.player.x = 85
      state.player.y = 47
      updateCamera(state)
      const startCamX = state.camera.x

      state.player.x = 86
      updateCamera(state)
      // With no deadzone, a single-tile move shifts the camera by exactly 1
      expect(state.camera.x).toBe(startCamX + 1)
    })

    it('does not clamp to map bounds; camera centers past map edges', () => {
      const state = createTestState({ viewportWidth: 40, viewportHeight: 40 })
      state.player.x = state.mapWidth - 1
      state.player.y = state.mapHeight - 1
      updateCamera(state)
      expect(state.camera.x).toBe(expectedFollowX(state.mapWidth - 1, state.viewportWidth))
      expect(state.camera.y).toBe(expectedFollowY(state.mapHeight - 1, state.viewportHeight))
    })

    it('places the player horizontally at iso canvas center and slightly above canvas center vertically (look-ahead bias)', () => {
      const state = createTestState({ viewportWidth: 40, viewportHeight: 40 })
      const charWidth = 8
      const charHeight = 14
      const positions = [
        { x: 73, y: 73 },
        { x: 90, y: 50 }, // northeast — was the original off-screen case
        { x: 50, y: 90 },
        { x: 0, y: 0 },
        { x: state.mapWidth - 1, y: 0 },
      ]
      for (const pos of positions) {
        state.player.x = pos.x
        state.player.y = pos.y
        updateCamera(state)
        const screen = worldToScreen(
          pos.x,
          pos.y,
          state.camera,
          charWidth,
          charHeight,
          state.viewportWidth,
          state.viewportHeight
        )
        const canvasCx = (state.viewportWidth * charWidth) / 2
        const canvasCy = (state.viewportHeight * charHeight) / 2
        // X axis: the iso-up bias adds to both camera.x and camera.y so
        // player.vx and player.vy both shift by isoBias. iso px =
        // (vx - vy) * cw is invariant under same-amount shifts, so X
        // remains near canvas center within ~one cell of slack.
        expect(Math.abs(screen.px - canvasCx)).toBeLessThanOrEqual(charWidth + charHeight)
        // Y axis: the iso-up bias shifts the player UP from canvas
        // center by isoBias * charHeight pixels (per the comment in
        // updateCamera). Player y should be <= canvasCy (above center)
        // within a small slack for the floor() in the camera formula.
        const biasPx = CAMERA_ISO_UP_BIAS_TILES * charHeight
        expect(screen.py - canvasCy).toBeLessThanOrEqual(charHeight)
        expect(canvasCy - screen.py).toBeLessThanOrEqual(biasPx + charHeight)
      }
    })
  })

  describe('small-map centering', () => {
    it('centers map when mapWidth and mapHeight are smaller than viewport', () => {
      const state = createTestState({ viewportWidth: 80, viewportHeight: 60 })
      state.mapWidth = 40
      state.mapHeight = 25
      state.player.x = 20
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(-Math.floor((state.viewportWidth - 40) / 2))
      expect(state.camera.y).toBe(-Math.floor((state.viewportHeight - 25) / 2))
    })

    it('camera offset is independent of player position when map is small', () => {
      const state = createTestState({ viewportWidth: 100, viewportHeight: 80 })
      state.mapWidth = 40
      state.mapHeight = 25
      const expectedX = -Math.floor((state.viewportWidth - 40) / 2)
      const expectedY = -Math.floor((state.viewportHeight - 25) / 2)
      const positions = [
        { x: 0, y: 0 },
        { x: 20, y: 12 },
        { x: 39, y: 24 },
      ]
      for (const pos of positions) {
        state.player.x = pos.x
        state.player.y = pos.y
        updateCamera(state)
        expect(state.camera.x).toBe(expectedX)
        expect(state.camera.y).toBe(expectedY)
      }
    })

    it('can center map on one axis and follow on the other', () => {
      const state = createTestState({ viewportWidth: 80, viewportHeight: 20 })
      state.mapWidth = 40
      state.player.x = 20
      state.player.y = 47
      updateCamera(state)
      // x-axis falls through to small-map centering — no iso bias.
      expect(state.camera.x).toBe(-Math.floor((state.viewportWidth - 40) / 2))
      // y-axis tracks the player with the iso bias.
      expect(state.camera.y).toBe(expectedFollowY(47, state.viewportHeight))
    })
  })

  describe('zone transitions', () => {
    it('recenters across cave/overworld swaps', () => {
      const state = createTestState({ viewportWidth: 40, viewportHeight: 40 })

      state.currentZone = Zone.Cave
      state.player.x = 20
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(expectedFollowX(20, state.viewportWidth))
      expect(state.camera.y).toBe(expectedFollowY(12, state.viewportHeight))

      state.currentZone = Zone.Overworld
      state.player.x = 85
      state.player.y = 47
      updateCamera(state)
      expect(state.camera.x).toBe(expectedFollowX(85, state.viewportWidth))
      expect(state.camera.y).toBe(expectedFollowY(47, state.viewportHeight))
    })
  })
})
