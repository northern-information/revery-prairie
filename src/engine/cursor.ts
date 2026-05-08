import { screenToTile } from './coordinates'

import type { CharMetrics, GameState } from './types'

export const updateCursorState = (state: GameState, metrics: CharMetrics): void => {
  if (state.heldDirection || state.path) {
    state.cursorTile = null
    return
  }

  const { charWidth, charHeight } = metrics
  const { camera } = state

  if (state.cursorScreenPos) {
    state.cursorTile = screenToTile(
      state.cursorScreenPos.x,
      state.cursorScreenPos.y,
      camera,
      charWidth,
      charHeight,
      state.viewportWidth,
      state.viewportHeight,
    )
  } else {
    state.cursorTile = null
  }
}
