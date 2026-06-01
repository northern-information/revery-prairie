import type { GameState } from './types'

// RP-69a — iso-vertical look-ahead. The orthogonal "center" of the
// viewport projects to iso canvas center, but that leaves very little
// iso-south of the player visible because the iso diamond's south
// vertex is close to the player. Shifting the camera diagonally
// (both x and y by the same amount) translates to a straight iso-
// vertical shift on screen: the player appears higher in the iso
// diamond, with more look-ahead toward iso-south. Without the
// matched x/y shift, biasing only one axis would also shift the
// player horizontally in iso.
//
// Fixed 3-tile shift (not viewport-relative): a small constant feels
// consistent across zone sizes and screen aspect ratios. Tuned by eye.
const CAMERA_ISO_UP_BIAS_TILES = 3

export const updateCamera = (state: GameState): void => {
  const focus = state.player

  if (state.mapWidth < state.viewportWidth) {
    state.camera.x = -Math.floor((state.viewportWidth - state.mapWidth) / 2)
  } else {
    state.camera.x = focus.x - Math.floor(state.viewportWidth / 2) + CAMERA_ISO_UP_BIAS_TILES
  }

  if (state.mapHeight < state.viewportHeight) {
    state.camera.y = -Math.floor((state.viewportHeight - state.mapHeight) / 2)
  } else {
    state.camera.y = focus.y - Math.floor(state.viewportHeight / 2) + CAMERA_ISO_UP_BIAS_TILES
  }
}
