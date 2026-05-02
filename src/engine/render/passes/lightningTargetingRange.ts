import {
  LIGHTNING_RANGE_HIGHLIGHT_COLOR,
  LIGHTNING_REVERY_RANGE,
} from '../../constants'
import { isInBounds } from '../../position'
import { drawCellBackground, viewportToScreen } from '../../projection'
import { TileType, type CharMetrics, type GameState } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { getTierGrid, liftAt } from '../tierGrid'
import { type RenderPass, registerPass } from '../passes'

const isActive = (state: GameState): boolean => state.targetingSlot !== null

const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  _time: number,
): void => {
  const { camera, viewportWidth, viewportHeight, map, player } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  ctx.fillStyle = LIGHTNING_RANGE_HIGHLIGHT_COLOR
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)
  for (let vy = bounds.vyStart; vy < bounds.vyEnd; vy++) {
    for (let vx = bounds.vxStart; vx < bounds.vxEnd; vx++) {
      const mx = camera.x + vx
      const my = camera.y + vy
      if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
      if (map[my][mx].type === TileType.Space) continue
      const dist = Math.abs(mx - player.x) + Math.abs(my - player.y)
      if (dist > LIGHTNING_REVERY_RANGE) continue
      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      drawCellBackground(
        ctx,
        px,
        py + liftAt(tierGrid, mx, my, state.mapWidth, state.mapHeight),
        charWidth,
        charHeight,
      )
    }
  }
}

export const lightningTargetingRangePass: RenderPass = {
  id: 'lightning-targeting-range',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(lightningTargetingRangePass)
