import {
  ACTION_COLOR,
  EDGE_SCROLL_INDICATOR_THICKNESS_PX,
} from '../../constants'
import type { CharMetrics, GameState } from '../../types'
import { type RenderPass, registerPass } from '../passes'

// Hot-pink lines along whichever canvas edges the cursor is currently
// inside. Includes an inner glow gradient extending into the playfield
// so the active edge reads as illuminated rather than a flat line.

const isActive = (state: GameState): boolean =>
  state.edgeScrollDirection.dx !== 0 || state.edgeScrollDirection.dy !== 0

const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  _time: number,
): void => {
  const { viewportWidth, viewportHeight, edgeScrollDirection: dir } = state
  const { charWidth, charHeight } = metrics
  const pxHeight = viewportHeight * charHeight
  const visibleWidthPx = (viewportWidth - state.rightInsetTiles) * charWidth
  const t = EDGE_SCROLL_INDICATOR_THICKNESS_PX
  const glowDepth = Math.max(charWidth * 1.5, 24)

  const drawEdgeGlow = (edge: 'left' | 'right' | 'top' | 'bottom'): void => {
    let gradient: CanvasGradient
    let solidX = 0
    let solidY = 0
    let solidW = 0
    let solidH = 0
    let glowX = 0
    let glowY = 0
    let glowW = 0
    let glowH = 0
    if (edge === 'left') {
      solidX = 0; solidY = 0; solidW = t; solidH = pxHeight
      glowX = t; glowY = 0; glowW = glowDepth; glowH = pxHeight
      gradient = ctx.createLinearGradient(t, 0, t + glowDepth, 0)
    } else if (edge === 'right') {
      solidX = visibleWidthPx - t; solidY = 0; solidW = t; solidH = pxHeight
      glowX = visibleWidthPx - t - glowDepth; glowY = 0; glowW = glowDepth; glowH = pxHeight
      gradient = ctx.createLinearGradient(visibleWidthPx - t - glowDepth, 0, visibleWidthPx - t, 0)
      gradient.addColorStop(0, 'rgba(255, 105, 180, 0)')
      gradient.addColorStop(1, 'rgba(255, 105, 180, 0.35)')
      ctx.fillStyle = gradient
      ctx.fillRect(glowX, glowY, glowW, glowH)
      ctx.fillStyle = ACTION_COLOR
      ctx.fillRect(solidX, solidY, solidW, solidH)
      return
    } else if (edge === 'top') {
      solidX = 0; solidY = 0; solidW = visibleWidthPx; solidH = t
      glowX = 0; glowY = t; glowW = visibleWidthPx; glowH = glowDepth
      gradient = ctx.createLinearGradient(0, t, 0, t + glowDepth)
    } else {
      solidX = 0; solidY = pxHeight - t; solidW = visibleWidthPx; solidH = t
      glowX = 0; glowY = pxHeight - t - glowDepth; glowW = visibleWidthPx; glowH = glowDepth
      gradient = ctx.createLinearGradient(0, pxHeight - t - glowDepth, 0, pxHeight - t)
      gradient.addColorStop(0, 'rgba(255, 105, 180, 0)')
      gradient.addColorStop(1, 'rgba(255, 105, 180, 0.35)')
      ctx.fillStyle = gradient
      ctx.fillRect(glowX, glowY, glowW, glowH)
      ctx.fillStyle = ACTION_COLOR
      ctx.fillRect(solidX, solidY, solidW, solidH)
      return
    }
    gradient.addColorStop(0, 'rgba(255, 105, 180, 0.35)')
    gradient.addColorStop(1, 'rgba(255, 105, 180, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(glowX, glowY, glowW, glowH)
    ctx.fillStyle = ACTION_COLOR
    ctx.fillRect(solidX, solidY, solidW, solidH)
  }

  if (dir.dx < 0) drawEdgeGlow('left')
  if (dir.dx > 0) drawEdgeGlow('right')
  if (dir.dy < 0) drawEdgeGlow('top')
  if (dir.dy > 0) drawEdgeGlow('bottom')
}

export const edgeScrollIndicatorPass: RenderPass = {
  id: 'edge-scroll-indicator',
  slot: 'screen-overlay',
  isActive,
  draw,
}

registerPass(edgeScrollIndicatorPass)
