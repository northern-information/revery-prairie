import {
  PRAIRIE_OUTLINE_ALPHA,
  PRAIRIE_OUTLINE_COLOR,
  PRAIRIE_OUTLINE_WIDTH,
} from '../../constants'
import { isInBounds } from '../../position'
import { DeepTimePhase, TileType, Zone, type CharMetrics, type GameState } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { type RenderPass, registerPass } from '../passes'

const isActive = (state: GameState): boolean => {
  if (state.currentZone !== Zone.Overworld) return false
  if (state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering)
    return false
  return true
}

// 1px crisp outline at the land/space border. Iterates the viewport plus
// a 1-tile margin so the outline aligns with the halo and remains
// continuous as the camera moves. The stroke sits on the boundary line.
const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  _time: number,
): void => {
  const { camera, viewportWidth, viewportHeight, map } = state
  const { charWidth, charHeight } = metrics
  const savedAlpha = ctx.globalAlpha
  const savedStroke = ctx.strokeStyle
  const savedLineWidth = ctx.lineWidth
  ctx.strokeStyle = PRAIRIE_OUTLINE_COLOR
  ctx.globalAlpha = PRAIRIE_OUTLINE_ALPHA
  ctx.lineWidth = PRAIRIE_OUTLINE_WIDTH

  const isSpaceOrOOB = (nx: number, ny: number): boolean => {
    if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) return true
    return map[ny][nx].type === TileType.Space
  }

  // Hoist frame-constant iso geometry above the loop. viewportToScreen and
  // getCellDiamondCorners previously recomputed these per tile and each
  // returned a heap object. These values only change on resize or zoom.
  // ISO_GLYPH_VERTICAL_NUDGE is always 0, so topY === py directly.
  const halfW = charWidth / 2
  const halfH = charHeight / 2
  const originX = (viewportHeight * charWidth) / 2 - halfW
  const originY = ((viewportHeight - viewportWidth) / 4) * charHeight

  ctx.beginPath()
  // Iso-aware bounds: the visible canvas is a parallelogram in tile space, so
  // iterating only the orthogonal viewport rect drops outline tiles in the
  // iso corners. getVisibleTileBounds expands to the rotated parallelogram.
  const { vxStart, vxEnd, vyStart, vyEnd } = getVisibleTileBounds(
    viewportWidth,
    viewportHeight,
    1,
  )
  for (let vy = vyStart; vy < vyEnd; vy++) {
    for (let vx = vxStart; vx < vxEnd; vx++) {
      const mx = camera.x + vx
      const my = camera.y + vy
      if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
      if (map[my][mx].type === TileType.Space) continue

      // Check all four neighbors before computing geometry. Most non-space
      // tiles are inland — computing screen coords and corners for them only
      // to find no edges to draw is wasted work.
      const nN = isSpaceOrOOB(mx, my - 1)
      const nE = isSpaceOrOOB(mx + 1, my)
      const nS = isSpaceOrOOB(mx, my + 1)
      const nW = isSpaceOrOOB(mx - 1, my)
      if (!nN && !nE && !nS && !nW) continue

      // Inline viewportToScreen + getCellDiamondCorners to avoid two object
      // allocations per border tile. Derived from the same formulas; nudge=0.
      const px = (vx - vy) * charWidth + originX + halfW
      const py = (vx + vy) * halfH + originY
      const leftX = px - halfW
      const rightX = px + 3 * halfW
      const topY = py
      const bottomY = py + charHeight
      const cx = px + halfW
      const cy = py + halfH

      // World cardinals map to diamond edges by on-screen direction:
      //   N (mx, my-1)  → up-right    → top-right edge
      //   E (mx+1, my)  → down-right  → bottom-right edge
      //   S (mx, my+1)  → down-left   → bottom-left edge
      //   W (mx-1, my)  → up-left     → top-left edge
      if (nN) {
        ctx.moveTo(cx, topY)
        ctx.lineTo(rightX, cy)
      }
      if (nE) {
        ctx.moveTo(rightX, cy)
        ctx.lineTo(cx, bottomY)
      }
      if (nS) {
        ctx.moveTo(cx, bottomY)
        ctx.lineTo(leftX, cy)
      }
      if (nW) {
        ctx.moveTo(leftX, cy)
        ctx.lineTo(cx, topY)
      }
    }
  }
  ctx.stroke()
  ctx.globalAlpha = savedAlpha
  ctx.strokeStyle = savedStroke
  ctx.lineWidth = savedLineWidth
}

export const prairieOutlinePass: RenderPass = {
  id: 'prairie-outline',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(prairieOutlinePass)
