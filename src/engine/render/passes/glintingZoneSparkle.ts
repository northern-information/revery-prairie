import {
  GLINT_ZONE_CHARS,
  GLINT_ZONE_COLORS,
  GLINT_ZONE_DENSITY,
  GLINT_ZONE_SPEED,
} from '../../constants'
import { isInBounds, posKey, tileHash } from '../../position'
import { viewportToScreen } from '../../projection'
import { Zone, type CharMetrics, type GameState } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { getTierGrid, liftAt } from '../tierGrid'
import { type RenderPass, registerPass } from '../passes'

// Animated sparkle chars on tiles in state.glintZones (overworld only).
// Per-tile density scales with glintOpacity so sparser tiles fade out
// gracefully when the patch dims.

const isActive = (state: GameState): boolean => state.currentZone === Zone.Overworld

const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  time: number,
): void => {
  const { camera, viewportWidth, viewportHeight, player } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)

  for (let vy = bounds.vyStart; vy < bounds.vyEnd; vy++) {
    for (let vx = bounds.vxStart; vx < bounds.vxEnd; vx++) {
      const wx = camera.x + vx
      const wy = camera.y + vy
      if (!isInBounds(wx, wy, state.mapWidth, state.mapHeight)) continue
      const key = posKey(wx, wy)
      if (!state.glintZones.has(key)) continue
      if (wx === player.x && wy === player.y) continue

      const h = tileHash(wx + state.rainSeed, wy)
      const opacity = state.glintOpacity.get(key) ?? 0
      if (opacity <= 0) continue
      const effectiveDensity = Math.ceil(GLINT_ZONE_DENSITY / opacity)
      if (h % effectiveDensity !== 0) continue

      const glintPhase =
        ((h >> 4) + Math.floor(time * GLINT_ZONE_SPEED)) % GLINT_ZONE_CHARS.length
      const glintColorPhase =
        ((h >> 8) + Math.floor(time * GLINT_ZONE_SPEED * 0.7)) % GLINT_ZONE_COLORS.length

      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      ctx.fillStyle = GLINT_ZONE_COLORS[glintColorPhase]
      ctx.fillText(
        GLINT_ZONE_CHARS[glintPhase],
        px,
        py + liftAt(tierGrid, wx, wy, state.mapWidth, state.mapHeight),
      )
    }
  }
}

export const glintingZoneSparklePass: RenderPass = {
  id: 'glinting-zone-sparkle',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(glintingZoneSparklePass)
