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
})
