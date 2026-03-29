import type { GameState } from './types'

export const updateCamera = (state: GameState): void => {
  if (state.mapWidth < state.viewportWidth) {
    state.camera.x = -Math.floor((state.viewportWidth - state.mapWidth) / 2)
  } else {
    state.camera.x = Math.max(
      0,
      Math.min(state.player.x - Math.floor(state.viewportWidth / 2), state.mapWidth - state.viewportWidth),
    )
  }

  if (state.mapHeight < state.viewportHeight) {
    state.camera.y = -Math.floor((state.viewportHeight - state.mapHeight) / 2)
  } else {
    state.camera.y = Math.max(
      0,
      Math.min(state.player.y - Math.floor(state.viewportHeight / 2), state.mapHeight - state.viewportHeight),
    )
  }
}
