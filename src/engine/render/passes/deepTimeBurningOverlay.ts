import { isInBounds, tileHash } from '../../position'
import { viewportToScreen } from '../../projection'
import { DeepTimePhase, TileType } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// Sparse animated fire chars on burnt clover during the Deep Time
// burning phase. Hardcoded glyph + color sets — these are visual props
// of the Deep Time finale only, not a general-purpose effect.
const FIRE_CHARS = ['^', '~', '*']
const FIRE_COLORS = ['#FF4500', '#FF6600', '#FF8800', '#FFAA00']

const isActive = (state: GameState): boolean =>
  state.deepTime?.active === true && state.deepTime.phase === DeepTimePhase.Burning

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight, map } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)

  for (let vy = bounds.vyStart; vy < bounds.vyEnd; vy++) {
    for (let vx = bounds.vxStart; vx < bounds.vxEnd; vx++) {
      const wx = camera.x + vx
      const wy = camera.y + vy
      if (!isInBounds(wx, wy, state.mapWidth, state.mapHeight)) continue
      if (map[wy][wx].type !== TileType.BurntFlora) continue

      const h = tileHash(wx, wy)
      if (h % 3 !== 0) continue

      const phase = ((h >> 4) + Math.floor(time * 0.01)) % FIRE_CHARS.length
      const colorPhase = ((h >> 8) + Math.floor(time * 0.008)) % FIRE_COLORS.length

      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      ctx.fillStyle = FIRE_COLORS[colorPhase]
      ctx.fillText(FIRE_CHARS[phase], px, py + liftAt(tierGrid, wx, wy, state.mapWidth, state.mapHeight))
    }
  }
}

export const deepTimeBurningOverlayPass: RenderPass = {
  id: 'deep-time-burning-overlay',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(deepTimeBurningOverlayPass)
