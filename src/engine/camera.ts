import type { GameState } from './types'

export const updateCamera = (state: GameState): void => {
  // Always center the player at the canvas center. The renderer projects
  // tiles iso, so the orthogonal viewport rectangle becomes a parallelogram
  // on canvas — any orthogonal deadzone lets the player drift off-canvas
  // at the iso corners. Orthogonal center maps to iso canvas center, so
  // setting camera = player - viewport/2 places the player at canvas
  // center in iso. No map-edge clamp: the map is surrounded by space
  // tiles, so overscroll simply renders more space.
  const focus = state.player

  if (state.mapWidth < state.viewportWidth) {
    state.camera.x = -Math.floor((state.viewportWidth - state.mapWidth) / 2)
  } else {
    state.camera.x = focus.x - Math.floor(state.viewportWidth / 2)
  }

  if (state.mapHeight < state.viewportHeight) {
    state.camera.y = -Math.floor((state.viewportHeight - state.mapHeight) / 2)
  } else {
    state.camera.y = focus.y - Math.floor(state.viewportHeight / 2)
  }
}
