import { updateCamera } from '../camera'
import { worldToScreen } from '../projection'
import { createGameState } from '../state'
import { Zone } from '../types'
import { describe, expect, it } from 'vitest'

describe('updateCamera', () => {
  describe('follow mode (always centers player)', () => {
    it('centers camera on the player in overworld', () => {
      const state = createGameState('Test', 40, 40)
      state.player.x = 85
      state.player.y = 47
      updateCamera(state)
      expect(state.camera.x).toBe(85 - Math.floor(state.viewportWidth / 2))
      expect(state.camera.y).toBe(47 - Math.floor(state.viewportHeight / 2))
    })

    it('centers camera on the player in cave zone', () => {
      const state = createGameState('Test', 10, 10)
      state.currentZone = Zone.Cave
      state.player.x = 50
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(50 - Math.floor(state.viewportWidth / 2))
      expect(state.camera.y).toBe(12 - Math.floor(state.viewportHeight / 2))
    })

    it('centers camera on the player in ruin zone', () => {
      const state = createGameState('Test', 10, 10)
      state.currentZone = Zone.Ruin
      state.player.x = 50
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(50 - Math.floor(state.viewportWidth / 2))
      expect(state.camera.y).toBe(12 - Math.floor(state.viewportHeight / 2))
    })

    it('recenters every step as the player walks (no deadzone)', () => {
      const state = createGameState('Test', 40, 40)
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
      const state = createGameState('Test', 40, 40)
      state.player.x = state.mapWidth - 1
      state.player.y = state.mapHeight - 1
      updateCamera(state)
      expect(state.camera.x).toBe(state.mapWidth - 1 - Math.floor(state.viewportWidth / 2))
      expect(state.camera.y).toBe(state.mapHeight - 1 - Math.floor(state.viewportHeight / 2))
    })

    it('places the player at the iso canvas center every frame', () => {
      const state = createGameState('Test', 40, 40)
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
        // Player anchor sits within ~one cell of canvas center; the floor
        // on viewport/2 introduces sub-tile slack but never an iso-corner
        // drift.
        expect(Math.abs(screen.px - canvasCx)).toBeLessThanOrEqual(charWidth + charHeight)
        expect(Math.abs(screen.py - canvasCy)).toBeLessThanOrEqual(charHeight)
      }
    })
  })

  describe('small-map centering', () => {
    it('centers map when mapWidth and mapHeight are smaller than viewport', () => {
      const state = createGameState('Test', 80, 60)
      state.mapWidth = 40
      state.mapHeight = 25
      state.player.x = 20
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(-Math.floor((state.viewportWidth - 40) / 2))
      expect(state.camera.y).toBe(-Math.floor((state.viewportHeight - 25) / 2))
    })

    it('camera offset is independent of player position when map is small', () => {
      const state = createGameState('Test', 100, 80)
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
      const state = createGameState('Test', 80, 20)
      state.mapWidth = 40
      state.player.x = 20
      state.player.y = 47
      updateCamera(state)
      expect(state.camera.x).toBe(-Math.floor((state.viewportWidth - 40) / 2))
      expect(state.camera.y).toBe(47 - Math.floor(state.viewportHeight / 2))
    })
  })

  describe('zone transitions', () => {
    it('recenters across cave/overworld swaps', () => {
      const state = createGameState('Test', 40, 40)

      state.currentZone = Zone.Cave
      state.player.x = 20
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(20 - Math.floor(state.viewportWidth / 2))
      expect(state.camera.y).toBe(12 - Math.floor(state.viewportHeight / 2))

      state.currentZone = Zone.Overworld
      state.player.x = 85
      state.player.y = 47
      updateCamera(state)
      expect(state.camera.x).toBe(85 - Math.floor(state.viewportWidth / 2))
      expect(state.camera.y).toBe(47 - Math.floor(state.viewportHeight / 2))
    })
  })
})
