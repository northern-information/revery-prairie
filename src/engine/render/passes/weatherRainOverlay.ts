import { RAIN_AURA_CHARS, RAIN_AURA_COLORS, RAIN_AURA_SPEED, WEATHER_RAIN_DENSITY } from '../../constants'
import { isInBounds, tileHash } from '../../position'
import { viewportToScreen } from '../../projection'
import { isInRainFront } from '../../tileWater'
import { Zone } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const isActive = (state: GameState): boolean => state.rainIntensity > 0 && state.currentZone === Zone.Overworld

// Animated rain follows the sweeping rain front (overworld only).
// Uses rainIntensity for fade in/out and isInRainFront for blotchy edges.
const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight, player } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  const savedAlpha = ctx.globalAlpha
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)

  for (let vy = bounds.vyStart; vy < bounds.vyEnd; vy++) {
    for (let vx = bounds.vxStart; vx < bounds.vxEnd; vx++) {
      const wx = camera.x + vx
      const wy = camera.y + vy
      if (!isInBounds(wx, wy, state.mapWidth, state.mapHeight)) continue
      if (wx === player.x && wy === player.y) continue

      const front = isInRainFront(state, wx, wy)
      if (!front.hit) continue

      const h = tileHash(wx + state.rainSeed, wy)
      if (h % WEATHER_RAIN_DENSITY !== 0) continue

      const phase = ((h >> 4) + Math.floor(time * RAIN_AURA_SPEED)) % RAIN_AURA_CHARS.length
      const colorPhase = ((h >> 8) + Math.floor(time * RAIN_AURA_SPEED * 0.7)) % RAIN_AURA_COLORS.length

      ctx.globalAlpha = state.rainIntensity * front.edgeAlpha

      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      ctx.fillStyle = RAIN_AURA_COLORS[colorPhase]
      ctx.fillText(RAIN_AURA_CHARS[phase], px, py + liftAt(tierGrid, wx, wy, state.mapWidth, state.mapHeight))
    }
  }
  ctx.globalAlpha = savedAlpha
}

export const weatherRainOverlayPass: RenderPass = {
  id: 'weather-rain-overlay',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(weatherRainOverlayPass)
