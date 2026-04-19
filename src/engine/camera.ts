import { Zone } from './types'
import type { GameState } from './types'

const DEADZONE_RATIO = 0.66

export const updateCamera = (state: GameState, forceCenter = false): void => {
  // The rightmost columns are hidden under the sidebar, so center and clamp
  // the player within only the visible portion of the viewport.
  const visibleWidth = state.viewportWidth - state.rightInsetTiles
  const useDeadzone = state.currentZone === Zone.Overworld && !forceCenter

  if (state.mapWidth < visibleWidth) {
    state.camera.x = -Math.floor((visibleWidth - state.mapWidth) / 2)
  } else if (useDeadzone) {
    const marginX = Math.floor((visibleWidth * (1 - DEADZONE_RATIO)) / 2)
    const leftBound = state.camera.x + marginX
    const rightBound = state.camera.x + visibleWidth - marginX - 1

    if (state.player.x < leftBound) {
      state.camera.x = state.player.x - marginX
    } else if (state.player.x > rightBound) {
      state.camera.x = state.player.x - visibleWidth + marginX + 1
    }

    state.camera.x = Math.max(0, Math.min(state.camera.x, state.mapWidth - visibleWidth))
  } else {
    state.camera.x = Math.max(
      0,
      Math.min(state.player.x - Math.floor(visibleWidth / 2), state.mapWidth - visibleWidth)
    )
  }

  if (state.mapHeight < state.viewportHeight) {
    state.camera.y = -Math.floor((state.viewportHeight - state.mapHeight) / 2)
  } else if (useDeadzone) {
    const marginY = Math.floor((state.viewportHeight * (1 - DEADZONE_RATIO)) / 2)
    const topBound = state.camera.y + marginY
    const bottomBound = state.camera.y + state.viewportHeight - marginY - 1

    if (state.player.y < topBound) {
      state.camera.y = state.player.y - marginY
    } else if (state.player.y > bottomBound) {
      state.camera.y = state.player.y - state.viewportHeight + marginY + 1
    }

    state.camera.y = Math.max(
      0,
      Math.min(state.camera.y, state.mapHeight - state.viewportHeight)
    )
  } else {
    state.camera.y = Math.max(
      0,
      Math.min(
        state.player.y - Math.floor(state.viewportHeight / 2),
        state.mapHeight - state.viewportHeight
      )
    )
  }
}
