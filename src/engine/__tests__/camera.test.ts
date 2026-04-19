import { updateCamera } from '../camera'
import { createGameState } from '../state'
import { Zone } from '../types'
import { describe, expect, it } from 'vitest'

describe('updateCamera', () => {
  describe('center-on-player (cave/ruin/forceCenter)', () => {
    it('centers camera on the player in cave zone', () => {
      const state = createGameState('Test', 10, 10)
      state.currentZone = Zone.Cave
      state.player.x = 50
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(50 - 5)
      expect(state.camera.y).toBe(12 - 5)
    })

    it('centers camera on the player with forceCenter', () => {
      const state = createGameState('Test', 10, 10)
      state.player.x = 50
      state.player.y = 12
      updateCamera(state, true)
      expect(state.camera.x).toBe(50 - 5)
      expect(state.camera.y).toBe(12 - 5)
    })

    it('clamps camera to the top-left edge', () => {
      const state = createGameState('Test', 20, 20)
      state.currentZone = Zone.Cave
      state.player.x = 0
      state.player.y = 0
      updateCamera(state)
      expect(state.camera.x).toBe(0)
      expect(state.camera.y).toBe(0)
    })

    it('clamps camera to the bottom-right edge', () => {
      const state = createGameState('Test', 20, 20)
      state.currentZone = Zone.Cave
      state.player.x = state.mapWidth - 1
      state.player.y = state.mapHeight - 1
      updateCamera(state)
      expect(state.camera.x).toBe(state.mapWidth - state.viewportWidth)
      expect(state.camera.y).toBe(state.mapHeight - state.viewportHeight)
    })

    it('centers map when map is smaller than viewport', () => {
      const state = createGameState('Test', 80, 60)
      state.mapWidth = 40
      state.mapHeight = 25
      state.player.x = 20
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(-Math.floor((80 - 40) / 2))
      expect(state.camera.y).toBe(-Math.floor((60 - 25) / 2))
    })

    it('centers map regardless of player position when map is small', () => {
      const state = createGameState('Test', 100, 80)
      state.mapWidth = 40
      state.mapHeight = 25
      const positions = [
        { x: 0, y: 0 },
        { x: 20, y: 12 },
        { x: 39, y: 24 },
      ]
      const expectedX = -Math.floor((100 - 40) / 2)
      const expectedY = -Math.floor((80 - 25) / 2)
      for (const pos of positions) {
        state.player.x = pos.x
        state.player.y = pos.y
        updateCamera(state)
        expect(state.camera.x).toBe(expectedX)
        expect(state.camera.y).toBe(expectedY)
      }
    })

    it('uses clamping when map is larger than viewport', () => {
      const state = createGameState('Test', 20, 20)
      state.currentZone = Zone.Cave
      state.player.x = 85
      state.player.y = 47
      updateCamera(state)
      expect(state.camera.x).toBe(85 - 10)
      expect(state.camera.y).toBe(47 - 10)
    })

    it('can center on one axis and clamp on the other', () => {
      const state = createGameState('Test', 80, 20)
      state.currentZone = Zone.Cave
      state.mapWidth = 40
      state.player.x = 20
      state.player.y = 47
      updateCamera(state)
      expect(state.camera.x).toBe(-Math.floor((80 - 40) / 2))
      expect(state.camera.y).toBe(47 - 10)
    })
  })

  describe('deadzone (overworld)', () => {
    it('does not move camera when player is inside the deadzone', () => {
      const state = createGameState('Test', 40, 40)
      // Force-center to establish a known camera position
      state.player.x = 85
      state.player.y = 47
      updateCamera(state, true)
      const startCamX = state.camera.x
      const startCamY = state.camera.y

      // Move player 1 tile right — still inside 66% deadzone
      state.player.x = 86
      updateCamera(state)
      expect(state.camera.x).toBe(startCamX)
      expect(state.camera.y).toBe(startCamY)
    })

    it('pans camera when player crosses the right deadzone boundary', () => {
      const state = createGameState('Test', 40, 40)
      state.player.x = 85
      state.player.y = 47
      updateCamera(state, true)
      const startCamX = state.camera.x

      // Calculate the right boundary
      const visibleWidth = state.viewportWidth - state.rightInsetTiles
      const marginX = Math.floor((visibleWidth * (1 - 0.66)) / 2)
      const rightBound = startCamX + visibleWidth - marginX - 1

      // Move player past the right boundary
      state.player.x = rightBound + 1
      updateCamera(state)
      expect(state.camera.x).toBeGreaterThan(startCamX)
      // Player should now be at the right edge of the deadzone
      const newRightBound = state.camera.x + visibleWidth - marginX - 1
      expect(state.player.x).toBe(newRightBound)
    })

    it('pans camera when player crosses the left deadzone boundary', () => {
      const state = createGameState('Test', 40, 40)
      state.player.x = 85
      state.player.y = 47
      updateCamera(state, true)
      const startCamX = state.camera.x

      const visibleWidth = state.viewportWidth - state.rightInsetTiles
      const marginX = Math.floor((visibleWidth * (1 - 0.66)) / 2)
      const leftBound = startCamX + marginX

      // Move player past the left boundary
      state.player.x = leftBound - 1
      updateCamera(state)
      expect(state.camera.x).toBeLessThan(startCamX)
      // Player should now be at the left edge of the deadzone
      const newLeftBound = state.camera.x + marginX
      expect(state.player.x).toBe(newLeftBound)
    })

    it('pans camera when player crosses the bottom deadzone boundary', () => {
      const state = createGameState('Test', 40, 40)
      state.player.x = 85
      state.player.y = 47
      updateCamera(state, true)
      const startCamY = state.camera.y

      const marginY = Math.floor((state.viewportHeight * (1 - 0.66)) / 2)
      const bottomBound = startCamY + state.viewportHeight - marginY - 1

      state.player.y = bottomBound + 1
      updateCamera(state)
      expect(state.camera.y).toBeGreaterThan(startCamY)
      const newBottomBound = state.camera.y + state.viewportHeight - marginY - 1
      expect(state.player.y).toBe(newBottomBound)
    })

    it('pans camera when player crosses the top deadzone boundary', () => {
      const state = createGameState('Test', 40, 40)
      state.player.x = 85
      state.player.y = 47
      updateCamera(state, true)
      const startCamY = state.camera.y

      const marginY = Math.floor((state.viewportHeight * (1 - 0.66)) / 2)
      const topBound = startCamY + marginY

      state.player.y = topBound - 1
      updateCamera(state)
      expect(state.camera.y).toBeLessThan(startCamY)
      const newTopBound = state.camera.y + marginY
      expect(state.player.y).toBe(newTopBound)
    })

    it('clamps to map bounds even with deadzone', () => {
      const state = createGameState('Test', 40, 40)
      // Player near top-left corner
      state.player.x = 2
      state.player.y = 2
      updateCamera(state, true)

      // Move player to (0, 0) — deadzone would want negative camera
      state.player.x = 0
      state.player.y = 0
      updateCamera(state)
      expect(state.camera.x).toBe(0)
      expect(state.camera.y).toBe(0)
    })

    it('clamps to map bottom-right bounds with deadzone', () => {
      const state = createGameState('Test', 40, 40)
      const visibleWidth = state.viewportWidth - state.rightInsetTiles
      // Player near bottom-right corner
      state.player.x = state.mapWidth - 2
      state.player.y = state.mapHeight - 2
      updateCamera(state, true)

      state.player.x = state.mapWidth - 1
      state.player.y = state.mapHeight - 1
      updateCamera(state)
      expect(state.camera.x).toBeLessThanOrEqual(state.mapWidth - visibleWidth)
      expect(state.camera.y).toBeLessThanOrEqual(state.mapHeight - state.viewportHeight)
    })

    it('accounts for sidebar inset in deadzone width', () => {
      const state = createGameState('Test', 40, 40)
      state.rightInsetTiles = 10
      state.player.x = 85
      state.player.y = 47
      updateCamera(state, true)

      // visibleWidth is 40 - 10 = 30
      const visibleWidth = 30
      const marginX = Math.floor((visibleWidth * (1 - 0.66)) / 2)
      const rightBound = state.camera.x + visibleWidth - marginX - 1

      // Move just inside the right boundary
      state.player.x = rightBound
      updateCamera(state)
      const camAfterInside = state.camera.x

      // Move one past the right boundary
      state.player.x = rightBound + 1
      updateCamera(state)
      expect(state.camera.x).toBeGreaterThan(camAfterInside)
    })

    it('does not use deadzone in cave zone', () => {
      const state = createGameState('Test', 10, 10)
      state.currentZone = Zone.Cave
      state.player.x = 50
      state.player.y = 12
      updateCamera(state)
      // Should center on player, not use deadzone
      expect(state.camera.x).toBe(50 - 5)
      expect(state.camera.y).toBe(12 - 5)
    })

    it('does not use deadzone in ruin zone', () => {
      const state = createGameState('Test', 10, 10)
      state.currentZone = Zone.Ruin
      state.player.x = 50
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(50 - 5)
      expect(state.camera.y).toBe(12 - 5)
    })

    it('recenters after zone transition back to overworld', () => {
      const state = createGameState('Test', 40, 40)
      state.player.x = 85
      state.player.y = 47
      updateCamera(state, true)

      // Simulate entering cave — player near top-left, camera clamps to 0
      state.currentZone = Zone.Cave
      state.player.x = 20
      state.player.y = 12
      updateCamera(state)
      expect(state.camera.x).toBe(0)
      expect(state.camera.y).toBe(0)

      // Simulate exiting cave back to overworld with forceCenter
      state.currentZone = Zone.Overworld
      state.player.x = 85
      state.player.y = 47
      updateCamera(state, true)
      // Should be centered on player
      const visibleWidth = state.viewportWidth - state.rightInsetTiles
      expect(state.camera.x).toBe(85 - Math.floor(visibleWidth / 2))
      expect(state.camera.y).toBe(47 - Math.floor(state.viewportHeight / 2))
    })
  })
})
