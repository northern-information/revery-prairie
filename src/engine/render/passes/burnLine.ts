// Precis #9b — burn line overlay. Renders a deeper amber on the
// lockedBurnLine tiles Moab has not yet walked. Drawn at the 'effect'
// slot so it composites above terrain but below screen overlays like
// the selection box. The draft overlay was removed alongside the
// authoring layer in the input-system-cleanup CR.

import { Zone } from '../../types'
import { drawCellHighlight, worldToScreen } from '../../projection'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const LOCKED_COLOR = '#E58A1E'
const LOCKED_ALPHA = 0.7

const isActive = (state: GameState): boolean => {
  if (state.currentZone !== Zone.Overworld) return false
  if (state.lockedBurnLine && state.lockedBurnLine.length > 0) return true
  return false
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics): void => {
  if (!state.lockedBurnLine || state.lockedBurnLine.length === 0) return
  const { camera, viewportWidth, viewportHeight } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)

  const start = state.burnLineIndex ?? 0
  const remaining = state.lockedBurnLine.slice(start)
  ctx.globalAlpha = LOCKED_ALPHA
  for (const tile of remaining) {
    const { px, py } = worldToScreen(tile.x, tile.y, camera, charWidth, charHeight, viewportWidth, viewportHeight)
    const pyLift = py + liftAt(tierGrid, tile.x, tile.y, state.mapWidth, state.mapHeight)
    drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, LOCKED_COLOR)
  }
  ctx.globalAlpha = 1
}

export const burnLinePass: RenderPass = {
  id: 'burn-line',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(burnLinePass)
