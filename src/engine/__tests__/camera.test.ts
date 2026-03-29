import { updateCamera } from '../camera'
import { createGameState } from '../state'
import { describe, expect, it } from 'vitest'

describe('updateCamera', () => {
  it('centers camera on the player', () => {
    const state = createGameState('Test', 10, 10)
    state.player.x = 50
    state.player.y = 12
    updateCamera(state)
    expect(state.camera.x).toBe(50 - 5)
    expect(state.camera.y).toBe(12 - 5)
  })

  it('clamps camera to the top-left edge', () => {
    const state = createGameState('Test', 20, 20)
    state.player.x = 0
    state.player.y = 0
    updateCamera(state)
    expect(state.camera.x).toBe(0)
    expect(state.camera.y).toBe(0)
  })

  it('clamps camera to the bottom-right edge', () => {
    const state = createGameState('Test', 20, 20)
    state.player.x = state.mapWidth - 1
    state.player.y = state.mapHeight - 1
    updateCamera(state)
    expect(state.camera.x).toBe(state.mapWidth - state.viewportWidth)
    expect(state.camera.y).toBe(state.mapHeight - state.viewportHeight)
  })

  it('centers map when map is smaller than viewport', () => {
    const state = createGameState('Test', 80, 60)
    // Simulate a small map (like a cave) that is smaller than the viewport
    state.mapWidth = 40
    state.mapHeight = 25
    state.player.x = 20
    state.player.y = 12
    updateCamera(state)
    // Should produce negative offsets to center the small map
    expect(state.camera.x).toBe(-Math.floor((80 - 40) / 2))
    expect(state.camera.y).toBe(-Math.floor((60 - 25) / 2))
  })

  it('centers map regardless of player position when map is small', () => {
    const state = createGameState('Test', 100, 80)
    state.mapWidth = 40
    state.mapHeight = 25
    // Player at different positions should not affect centering
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
    // Default map is 170x95, both larger than viewport 20x20
    state.player.x = 85
    state.player.y = 47
    updateCamera(state)
    // Standard player-centered clamping
    expect(state.camera.x).toBe(85 - 10)
    expect(state.camera.y).toBe(47 - 10)
  })

  it('can center on one axis and clamp on the other', () => {
    const state = createGameState('Test', 80, 20)
    // Make width smaller than viewport but keep height larger
    state.mapWidth = 40
    // mapHeight stays at 95 (larger than viewport 20)
    state.player.x = 20
    state.player.y = 47
    updateCamera(state)
    // x axis: centered (map smaller than viewport)
    expect(state.camera.x).toBe(-Math.floor((80 - 40) / 2))
    // y axis: player-centered with clamping (map larger than viewport)
    expect(state.camera.y).toBe(47 - 10)
  })
})
