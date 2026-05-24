// RP-18 — pink cell highlight on the tile the cursor is over while
// an inventory drag is active over the canvas. Mirrors clickTarget's
// hot-pink palette so dragging and right-click-to-walk share the same
// "destination is here" visual vocabulary. Cleared by useCanvasDrop on
// drag cancel / drop, so this pass only draws while a drop is mid-flight.

import { ACTION_COLOR } from '../../constants'
import { drawCellHighlight, worldToScreen } from '../../projection'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const isActive = (state: GameState): boolean => state.dragHoverTile !== null

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, _time: number): void => {
  const target = state.dragHoverTile
  if (!target) return
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  const { px, py } = worldToScreen(
    target.x,
    target.y,
    state.camera,
    charWidth,
    charHeight,
    state.viewportWidth,
    state.viewportHeight
  )
  const lift = liftAt(tierGrid, target.x, target.y, state.mapWidth, state.mapHeight)
  const savedAlpha = ctx.globalAlpha
  ctx.globalAlpha = 0.55
  drawCellHighlight(ctx, px, py - lift, charWidth, charHeight, ACTION_COLOR)
  ctx.globalAlpha = savedAlpha
}

export const dragHoverTilePass: RenderPass = {
  id: 'drag-hover-tile',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(dragHoverTilePass)
