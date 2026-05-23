import { FIRE_TICK_MS, FIREPLACE_COLOR_A, FIREPLACE_COLOR_B } from '../../constants'
import { worldToScreen } from '../../projection'
import { TileType, Zone } from '../../types'
import { registerPass } from '../passes'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// Precis #33 — soft warm glow around the little house fireplace. Only
// active when the player is in the house interior; cheap to draw (one
// radial gradient per Fireplace tile).
const isActive = (state: GameState): boolean => state.currentZone === Zone.HouseInterior

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { map, camera, viewportWidth, viewportHeight } = state
  const { charWidth, charHeight } = metrics

  // Pulse the glow at the same cadence as the fireplace glyph cycle so the
  // light feels tied to the flicker.
  const tick = Math.floor(time / FIRE_TICK_MS)
  const pulseColor = tick % 2 === 0 ? FIREPLACE_COLOR_A : FIREPLACE_COLOR_B
  const radius = Math.max(charWidth, charHeight) * 4

  const savedComposite = ctx.globalCompositeOperation
  // Additive blend so the warm color sums with the dark interior bg
  // without flattening the tile glyphs underneath.
  ctx.globalCompositeOperation = 'lighter'

  for (let y = 0; y < map.length; y++) {
    const row = map[y]
    for (let x = 0; x < row.length; x++) {
      if (row[x].type !== TileType.Fireplace) continue
      const { px, py } = worldToScreen(x, y, camera, charWidth, charHeight, viewportWidth, viewportHeight)
      const cx = px
      const cy = py - charHeight / 2
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      gradient.addColorStop(0, pulseColor)
      gradient.addColorStop(0.4, hexWithAlpha(pulseColor, 0.4))
      gradient.addColorStop(1, hexWithAlpha(pulseColor, 0))
      ctx.fillStyle = gradient
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
    }
  }

  ctx.globalCompositeOperation = savedComposite
}

// Convert a `#RRGGBB` color and a 0..1 alpha into a `rgba(...)` string.
// The fireplace color constants are hex strings; we need alpha control
// for the gradient stops.
const hexWithAlpha = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`
}

export const fireplaceGlowPass: RenderPass = {
  id: 'fireplace-glow',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(fireplaceGlowPass)
