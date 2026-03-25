import { isInBounds } from '../position'
import { createGameState } from '../state'
import { TileType } from '../types'

import type { GameState } from '../types'

/**
 * Creates a minimal game state for testing — empty backpack, no entities,
 * no shooting stars. Tests should explicitly add only what they need.
 *
 * Wraps createGameState to stay in sync with the state shape, then clears
 * gameplay-specific content.
 */
export const createTestState = (opts?: { viewportWidth?: number; viewportHeight?: number }): GameState => {
  const state = createGameState('Test', opts?.viewportWidth ?? 20, opts?.viewportHeight ?? 20)
  state.backpack.items = []
  state.bees = []
  state.shootingStars = []
  state.meteorites = []
  state.explosions = []
  state.groundItems = []
  state.groundOmniboxes = []
  state.characters = []
  state.openContainer = null
  state.playerFacing = 'down'
  state.facingOmniboxPos = null
  state.omniboxContainers = new Map()
  state.nextOmniboxNumber = 1
  state.discoveredRecipes = new Set()
  state.activeDialog = null
  state.previewFn = null
  state.path = null
  state.pendingAction = null
  return state
}

/**
 * Clears terrain to dirt in a radius around a position.
 */
export const clearArea = (state: GameState, cx: number, cy: number, radius: number): void => {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const ny = cy + dy
      const nx = cx + dx
      if (isInBounds(nx, ny, state.mapWidth, state.mapHeight)) {
        state.map[ny][nx] = { type: TileType.Dirt }
      }
    }
  }
}

/**
 * Clears terrain to dirt around the player.
 */
export const clearAroundPlayer = (state: GameState, radius = 2): void => {
  clearArea(state, state.player.x, state.player.y, radius)
}
