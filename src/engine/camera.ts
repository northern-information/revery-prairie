import { ComponentType } from './ecs/types'

import type { GameState } from './types'

// During the steward star descent, the camera follows the star's head
// instead of state.player. Returns the world tile the camera should
// center on this frame: the steward star's Position while it is alive,
// or null if the steward star is not active (so the caller can fall
// back to state.player).
const stewardStarFocus = (state: GameState): { x: number; y: number } | null => {
  const spawn = state.playerSpawn
  if (spawn.visible) return null
  if (spawn.meteorEntityId === null) return null
  const pos = state.world.getComponent(spawn.meteorEntityId, ComponentType.Position)
  if (!pos) return null
  return { x: pos.x, y: pos.y }
}

export const updateCamera = (state: GameState): void => {
  // Always center the player at the canvas center. The renderer projects
  // tiles iso, so the orthogonal viewport rectangle becomes a parallelogram
  // on canvas — any orthogonal deadzone lets the player drift off-canvas
  // at the iso corners. Orthogonal center maps to iso canvas center, so
  // setting camera = player - viewport/2 places the player at canvas
  // center in iso. No map-edge clamp: the map is surrounded by space
  // tiles, so overscroll simply renders more space.
  const stewardFocus = stewardStarFocus(state)
  const focus = stewardFocus ?? state.player

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
