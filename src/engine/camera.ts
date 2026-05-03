import type { GameState } from './types'

export const updateCamera = (state: GameState, forceCenter = false): void => {
  // RTS free-pan mode: skip auto-centering entirely unless the caller
  // explicitly forces it (zone swap, game start, resize). Edge-scroll
  // mutates state.camera directly while in free mode; we don't want
  // movePlayer or other movement paths to fight that.
  if (state.cameraMode === 'free' && !forceCenter) return

  // The rightmost columns are hidden under the sidebar, so center the
  // player within only the visible portion of the viewport.
  const visibleWidth = state.viewportWidth - state.rightInsetTiles

  // Always center the player at the canvas center. The renderer projects
  // tiles iso, so the orthogonal viewport rectangle becomes a parallelogram
  // on canvas — any orthogonal deadzone lets the player drift off-canvas
  // at the iso corners. Orthogonal center maps to iso canvas center, so
  // setting camera = player - viewport/2 places the player at canvas
  // center in iso. No map-edge clamp: the map is surrounded by space
  // tiles, so overscroll simply renders more space.
  if (state.mapWidth < visibleWidth) {
    state.camera.x = -Math.floor((visibleWidth - state.mapWidth) / 2)
  } else {
    state.camera.x = state.player.x - Math.floor(visibleWidth / 2)
  }

  if (state.mapHeight < state.viewportHeight) {
    state.camera.y = -Math.floor((state.viewportHeight - state.mapHeight) / 2)
  } else {
    state.camera.y = state.player.y - Math.floor(state.viewportHeight / 2)
  }
}
