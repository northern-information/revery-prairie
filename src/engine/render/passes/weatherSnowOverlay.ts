// Snow overlay (precis #2). Mirrors weatherRainOverlay but draws slow-
// drifting white/grey flakes when state.weather.sky === Sky.Snow. Snow
// falls over the whole viewport rather than along a rain front — the
// front-sweep visual is rain-specific (humid air mass moving across the
// prairie); snow is the season itself, not a passing event.
//
// Per v3 doctrine the winter palette wash dims native tiles and makes
// the egregoric violet pop. The snow flakes draw at full white/grey
// regardless of the wash because they sit in the 'effect' slot above
// the central tile-glyph loop — the wash is a per-tile color blend in
// that loop, not a post-pass.

import { SNOW_AURA_CHARS, SNOW_AURA_COLORS, SNOW_AURA_SPEED, WEATHER_SNOW_DENSITY } from '../../constants'
import { isInBounds, tileHash } from '../../position'
import { viewportToScreen } from '../../projection'
import { Sky, Zone } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const isActive = (state: GameState): boolean =>
  state.weather.sky === Sky.Snow && state.precipitationIntensity > 0 && state.currentZone === Zone.Overworld

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight, player } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  const savedAlpha = ctx.globalAlpha
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)

  // Slight horizontal sway driven by wind. The wind speed (mph) scales
  // the sway amplitude; a calm winter day produces near-vertical flakes,
  // a windy one drifts them across a few tiles per cycle.
  const windSway = Math.sin(time * SNOW_AURA_SPEED * 0.5) * Math.min(state.weather.windSpeed / 30, 1)

  ctx.globalAlpha = state.precipitationIntensity

  for (let vy = bounds.vyStart; vy < bounds.vyEnd; vy++) {
    for (let vx = bounds.vxStart; vx < bounds.vxEnd; vx++) {
      const wx = camera.x + vx
      const wy = camera.y + vy
      if (!isInBounds(wx, wy, state.mapWidth, state.mapHeight)) continue
      if (wx === player.x && wy === player.y) continue

      const h = tileHash(wx, wy)
      if (h % WEATHER_SNOW_DENSITY !== 0) continue

      const phase = ((h >> 4) + Math.floor(time * SNOW_AURA_SPEED)) % SNOW_AURA_CHARS.length
      const colorPhase = ((h >> 8) + Math.floor(time * SNOW_AURA_SPEED * 0.7)) % SNOW_AURA_COLORS.length

      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      ctx.fillStyle = SNOW_AURA_COLORS[colorPhase]
      ctx.fillText(
        SNOW_AURA_CHARS[phase],
        px + windSway * charWidth * 0.3,
        py + liftAt(tierGrid, wx, wy, state.mapWidth, state.mapHeight)
      )
    }
  }
  ctx.globalAlpha = savedAlpha
}

export const weatherSnowOverlayPass: RenderPass = {
  id: 'weather-snow-overlay',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(weatherSnowOverlayPass)
