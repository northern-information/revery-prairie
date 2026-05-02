import { HOVER_PATH_MAX_DISTANCE } from './constants'
import { screenToTile } from './coordinates'
import { isDeepTimeLocked } from './deepTime'
import { getPathfindingBlockers } from './movement'
import { findPath } from './pathfinding'
import { isInBounds, isWalkableTile } from './position'

import type { CharMetrics, GameState } from './types'

export const updateCursorState = (state: GameState, metrics: CharMetrics): void => {
  const { charWidth, charHeight } = metrics
  const { camera, player } = state

  // Recompute cursor world tile from screen position every frame
  // so the highlight tracks correctly when the camera moves via WASD
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

  // Suppress hover path during deep time locked phases
  if (isDeepTimeLocked(state)) {
    state.hoverPath = null
    state.hoverPathTarget = null
    return
  }

  // Recompute hover path when cursor tile changes
  const ct = state.cursorTile
  const ht = state.hoverPathTarget
  if (ct && (ct.x !== ht?.x || ct.y !== ht?.y) && (ct.x !== player.x || ct.y !== player.y) && !state.path) {
    state.hoverPathTarget = { x: ct.x, y: ct.y }
    const dist = Math.abs(ct.x - player.x) + Math.abs(ct.y - player.y)
    if (dist <= HOVER_PATH_MAX_DISTANCE && isInBounds(ct.x, ct.y, state.mapWidth, state.mapHeight) && isWalkableTile(state.map[ct.y][ct.x].type)) {
      const hoverBlocked = getPathfindingBlockers(state, ct)
      state.hoverPath = findPath(state.map, state.mapWidth, state.mapHeight, player, ct, hoverBlocked, {
        allowDiagonal: true,
      })
    } else {
      state.hoverPath = null
    }
  } else if (!ct || state.path) {
    state.hoverPath = null
    state.hoverPathTarget = null
  }
}
