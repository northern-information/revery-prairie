import {
  PRAIRIE_OUTLINE_ALPHA,
  PRAIRIE_OUTLINE_COLOR,
  PRAIRIE_OUTLINE_WIDTH,
} from '../../constants'
import { isInBounds } from '../../position'
import { getCellDiamondCorners, viewportToScreen } from '../../projection'
import { DeepTimePhase, TileType, Zone, type CharMetrics, type GameState } from '../../types'
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
  ctx.beginPath()
  const outlineMargin = 1
  for (let vy = -outlineMargin; vy < viewportHeight + outlineMargin; vy++) {
    for (let vx = -outlineMargin; vx < viewportWidth + outlineMargin; vx++) {
      const mx = camera.x + vx
      const my = camera.y + vy
      if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
      if (map[my][mx].type === TileType.Space) continue
      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      const { leftX, rightX, topY, bottomY, cx, cy } = getCellDiamondCorners(
        px,
        py,
        charWidth,
        charHeight,
      )
      // World cardinals map to diamond edges by on-screen direction:
      //   N (mx, my-1)  → up-right    → top-right edge
      //   E (mx+1, my)  → down-right  → bottom-right edge
      //   S (mx, my+1)  → down-left   → bottom-left edge
      //   W (mx-1, my)  → up-left     → top-left edge
      if (isSpaceOrOOB(mx, my - 1)) {
        ctx.moveTo(cx, topY)
        ctx.lineTo(rightX, cy)
      }
      if (isSpaceOrOOB(mx + 1, my)) {
        ctx.moveTo(rightX, cy)
        ctx.lineTo(cx, bottomY)
      }
      if (isSpaceOrOOB(mx, my + 1)) {
        ctx.moveTo(cx, bottomY)
        ctx.lineTo(leftX, cy)
      }
      if (isSpaceOrOOB(mx - 1, my)) {
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
