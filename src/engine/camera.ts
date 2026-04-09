import type { GameState } from './types'

export const updateCamera = (state: GameState): void => {
  // The rightmost columns are hidden under the sidebar, so center and clamp
  // the player within only the visible portion of the viewport.
  const visibleWidth = state.viewportWidth - state.rightInsetTiles

  if (state.mapWidth < visibleWidth) {
    state.camera.x = -Math.floor((visibleWidth - state.mapWidth) / 2)
  } else {
    state.camera.x = Math.max(
      0,
      Math.min(state.player.x - Math.floor(visibleWidth / 2), state.mapWidth - visibleWidth)
    )
  }

  if (state.mapHeight < state.viewportHeight) {
    state.camera.y = -Math.floor((state.viewportHeight - state.mapHeight) / 2)
  } else {
    state.camera.y = Math.max(
      0,
      Math.min(state.player.y - Math.floor(state.viewportHeight / 2), state.mapHeight - state.viewportHeight)
    )
  }
}
