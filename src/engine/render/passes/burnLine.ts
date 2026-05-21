// Precis #9b — burn line overlay. Renders a faint amber tint on
// burnLineDraft tiles and a deeper amber on lockedBurnLine tiles
// (only the segment Moab has not yet walked). Drawn at the
// 'effect' slot so it composites above terrain but below screen
// overlays like the selection box.

import { Zone } from '../../types'
import { drawCellHighlight, worldToScreen } from '../../projection'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const DRAFT_COLOR = '#9C6B2A'
const LOCKED_COLOR = '#E58A1E'
const DRAFT_ALPHA = 0.4
const LOCKED_ALPHA = 0.7

const isActive = (state: GameState): boolean => {
  if (state.currentZone !== Zone.Overworld) return false
  if (state.burnLineDraft && state.burnLineDraft.length > 0) return true
  if (state.lockedBurnLine && state.lockedBurnLine.length > 0) return true
  return false
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics): void => {
  const { camera, viewportWidth, viewportHeight } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)

  const paint = (tiles: { x: number; y: number }[], color: string, alpha: number): void => {
    ctx.globalAlpha = alpha
    for (const tile of tiles) {
      const { px, py } = worldToScreen(tile.x, tile.y, camera, charWidth, charHeight, viewportWidth, viewportHeight)
      const pyLift = py + liftAt(tierGrid, tile.x, tile.y, state.mapWidth, state.mapHeight)
      drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, color)
    }
    ctx.globalAlpha = 1
  }

  if (state.burnLineDraft && state.burnLineDraft.length > 0) {
    paint(state.burnLineDraft, DRAFT_COLOR, DRAFT_ALPHA)
  }

  if (state.lockedBurnLine && state.lockedBurnLine.length > 0) {
    const start = state.burnLineIndex ?? 0
    const remaining = state.lockedBurnLine.slice(start)
    paint(remaining, LOCKED_COLOR, LOCKED_ALPHA)
  }
}

export const burnLinePass: RenderPass = {
  id: 'burn-line',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(burnLinePass)
