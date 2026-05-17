import { ACTION_COLOR, BG_COLOR, MOVE_ORDER_MARKER_DURATION_MS } from '../../constants'
import { drawCellHighlight, worldToScreen } from '../../projection'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const isActive = (state: GameState): boolean => state.moveOrderMarkers.length > 0

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  for (const marker of state.moveOrderMarkers) {
    const elapsed = time - marker.time
    if (elapsed >= MOVE_ORDER_MARKER_DURATION_MS) continue
    const alpha = 1 - elapsed / MOVE_ORDER_MARKER_DURATION_MS
    const { px, py } = worldToScreen(
      marker.position.x,
      marker.position.y,
      camera,
      charWidth,
      charHeight,
      viewportWidth,
      viewportHeight
    )
    const pyLift = py + liftAt(tierGrid, marker.position.x, marker.position.y, state.mapWidth, state.mapHeight)
    ctx.globalAlpha = alpha
    drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, ACTION_COLOR)
    ctx.fillStyle = BG_COLOR
    ctx.fillText('X', px, pyLift)
    ctx.globalAlpha = 1
  }
}

export const moveOrderMarkersPass: RenderPass = {
  id: 'move-order-markers',
  slot: 'screen-overlay',
  isActive,
  draw,
}

registerPass(moveOrderMarkersPass)
