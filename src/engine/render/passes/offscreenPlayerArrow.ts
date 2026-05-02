import { ACTION_COLOR, BG_COLOR } from '../../constants'
import { worldToScreen } from '../../projection'
import type { CharMetrics, GameState } from '../../types'
import { type RenderPass, registerPass } from '../passes'

const pickArrowGlyph = (dx: number, dy: number): string => {
  // ASCII-only glyphs so any monospace font renders them. Dominant axis
  // wins; pure diagonals fall through to corner brackets.
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax > ay * 1.5) return dx > 0 ? '>' : '<'
  if (ay > ax * 1.5) return dy > 0 ? 'v' : '^'
  if (dx > 0 && dy > 0) return '\\'
  if (dx > 0 && dy < 0) return '/'
  if (dx < 0 && dy > 0) return '/'
  return '\\'
}

const isActive = (state: GameState): boolean => state.cameraMode === 'free'

// When free-pan moves the camera away from the player, draw a hot-pink
// chunk with an arrow glyph at the playfield edge nearest the player.
// Visible inside the playfield rect (excluding sidebar inset).
const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  _time: number,
): void => {
  const { camera, player, viewportWidth, viewportHeight } = state
  const { charWidth, charHeight } = metrics
  const pxHeight = viewportHeight * charHeight
  const visibleWidthPx = (viewportWidth - state.rightInsetTiles) * charWidth
  const { px: ppx, py: ppy } = worldToScreen(
    player.x,
    player.y,
    camera,
    charWidth,
    charHeight,
    viewportWidth,
    viewportHeight,
  )
  const margin = charWidth * 1.5
  const offscreen =
    ppx < margin || ppx > visibleWidthPx - margin || ppy < margin || ppy > pxHeight - margin
  if (!offscreen) return
  const cx = visibleWidthPx / 2
  const cy = pxHeight / 2
  const dx = ppx - cx
  const dy = ppy - cy
  const halfW = visibleWidthPx / 2 - margin
  const halfH = pxHeight / 2 - margin
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx)
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy)
  const t = Math.min(tx, ty)
  const ax = cx + dx * t
  const ay = cy + dy * t
  const arrow = pickArrowGlyph(dx, dy)
  ctx.fillStyle = ACTION_COLOR
  ctx.fillRect(ax - charWidth, ay - charHeight / 2, 2 * charWidth, charHeight)
  ctx.fillStyle = BG_COLOR
  ctx.fillText(arrow, ax - charWidth / 2, ay - charHeight / 2)
}

export const offscreenPlayerArrowPass: RenderPass = {
  id: 'offscreen-player-arrow',
  slot: 'screen-overlay',
  isActive,
  draw,
}

registerPass(offscreenPlayerArrowPass)
