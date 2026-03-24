import type { GameState } from './types'

export const updateCamera = (state: GameState): void => {
  state.camera.x = Math.max(
    0,
    Math.min(state.player.x - Math.floor(state.viewportWidth / 2), state.mapWidth - state.viewportWidth)
  )
  state.camera.y = Math.max(
    0,
    Math.min(state.player.y - Math.floor(state.viewportHeight / 2), state.mapHeight - state.viewportHeight)
  )
}
