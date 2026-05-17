import { getFloraPollinate } from '../../flora'
import { tileHash } from '../../position'
import { worldToScreen } from '../../projection'
import { registerPass } from '../passes'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// ─── constants ────────────────────────────────────────────────────────────────

/** Oscillation frequency for per-particle luminance shimmer (rad/ms). */
const SHIMMER_FREQ = 0.003

/** Peak brightness shift per RGB channel for shimmer (0–255). */
const SHIMMER_RANGE = 18

// ─── color helpers ────────────────────────────────────────────────────────────

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

// Shift luminance using a pre-parsed RGB tuple — no regex, no string parsing.
const shiftLuminanceFast = (rgb: [number, number, number], delta: number): string => {
  const d = Math.round(delta)
  return `rgb(${String(clamp255(rgb[0] + d))},${String(clamp255(rgb[1] + d))},${String(clamp255(rgb[2] + d))})`
}

// ─── draw ─────────────────────────────────────────────────────────────────────

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  if (state.pollen.length === 0) return

  const { charWidth, charHeight } = metrics
  const { camera, viewportWidth, viewportHeight } = state
  const savedAlpha = ctx.globalAlpha

  for (const p of state.pollen) {
    const profile = getFloraPollinate(p.profileId)
    if (!profile) continue

    // Snap to integer tile coords so particles move in discrete steps (limited
    // animation), matching the stepped look of shooting stars, meteors, and glints.
    const { px, py } = worldToScreen(
      Math.round(p.x),
      Math.round(p.y),
      camera,
      charWidth,
      charHeight,
      viewportWidth,
      viewportHeight
    )

    // Linear fade: opacity 1 → 0 over the particle's lifetime.
    const opacity = 1 - p.age / p.maxAge

    // Per-particle shimmer: tile-hash offset so adjacent particles don't sync.
    const h = tileHash(Math.floor(p.x), Math.floor(p.y))
    const shimmerDelta = Math.sin(time * SHIMMER_FREQ + (h % 628) / 100) * SHIMMER_RANGE

    ctx.globalAlpha = savedAlpha * Math.max(0, opacity)
    ctx.fillStyle = shiftLuminanceFast(profile.parsedColor, shimmerDelta)
    ctx.fillText(profile.glyph, px, py)
  }

  ctx.globalAlpha = savedAlpha
}

// ─── registration ─────────────────────────────────────────────────────────────

export const pollenOverlayPass: RenderPass = {
  id: 'pollen-overlay',
  slot: 'effect',
  isActive: () => true,
  draw,
}

registerPass(pollenOverlayPass)
