import { CELLAR_FADE_DISTANCE, CELLAR_READ_DISTANCE } from '../../constants'
import { worldToScreen } from '../../projection'
import { Zone } from '../../types'
import { registerPass } from '../passes'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// RP-37 — Knot Cellar distance-fog pass.
//
// Overlays a per-tile black alpha mask keyed on Chebyshev distance from
// the steward:
//   * d ≤ CELLAR_READ_DISTANCE        → alpha 0 (no overlay)
//   * d in fade band                  → linear fade from 0 to 1
//   * d > READ + FADE                 → alpha 1 (fully black)
//
// The fog is recomputed every frame so the corridor reveals as the
// steward advances. There is no fog-of-war "discovered tiles stay
// lit" memory — by design, the cellar darkens behind the steward.

const isActive = (state: GameState): boolean => state.currentZone === Zone.KnotCellar

const FAR_LIMIT = CELLAR_READ_DISTANCE + CELLAR_FADE_DISTANCE

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, _time: number): void => {
  const { camera, viewportWidth, viewportHeight, player, mapWidth, mapHeight } = state
  const { charWidth, charHeight } = metrics

  // Iterate the visible window (camera-relative). Computing per-tile is
  // cheap relative to the canvas — the cellar map is narrow (7 wide)
  // and the visible window is small.
  const startX = Math.max(0, Math.floor(camera.x))
  const endX = Math.min(mapWidth, Math.ceil(camera.x + viewportWidth))
  const startY = Math.max(0, Math.floor(camera.y))
  const endY = Math.min(mapHeight, Math.ceil(camera.y + viewportHeight))

  ctx.save()
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const d = Math.max(Math.abs(x - player.x), Math.abs(y - player.y))
      if (d <= CELLAR_READ_DISTANCE) continue
      let alpha: number
      if (d >= FAR_LIMIT) {
        alpha = 1
      } else {
        alpha = (d - CELLAR_READ_DISTANCE) / CELLAR_FADE_DISTANCE
      }
      ctx.fillStyle = `rgba(0, 0, 0, ${String(alpha)})`
      const { px, py } = worldToScreen(x, y, camera, charWidth, charHeight, viewportWidth, viewportHeight)
      // Iso diamond footprint approximation: fill a charWidth x charHeight
      // rect anchored at the glyph center. Slight overlap with neighbors is
      // fine — the alpha gradient is monotonic so adjacent fills compose
      // toward the higher of the two.
      ctx.fillRect(px - charWidth / 2, py - charHeight / 2, charWidth, charHeight)
    }
  }
  ctx.restore()
}

export const knotCellarFogPass: RenderPass = {
  id: 'knot-cellar-fog',
  slot: 'screen-overlay',
  isActive,
  draw,
}

registerPass(knotCellarFogPass)
