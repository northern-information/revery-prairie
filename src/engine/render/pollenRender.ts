import { tileHash } from '@/engine/position'
import { POLLEN_PROFILES } from '@/engine/pollen'
import { worldToScreen } from '@/engine/projection'
import type { CharMetrics, GameState } from '@/engine/types'

// ─── constants ───────────────────────────────────────────────────────────────

/** Oscillation frequency for luminance shimmer (rad/ms). */
const SHIMMER_FREQ = 0.003

/** Peak brightness shift per RGB channel for shimmer (0–255). */
const SHIMMER_RANGE = 18

// ─── color helpers ────────────────────────────────────────────────────────────

const parseHex = (color: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

const shiftLuminance = (color: string, delta: number): string => {
  const rgb = parseHex(color)
  if (!rgb) return color
  const [r, g, b] = rgb
  return `rgb(${String(clamp255(r + delta))},${String(clamp255(g + delta))},${String(clamp255(b + delta))})`
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Draw all live pollen particles onto the canvas.
 *
 * Called once per frame after the tile loop (and after deferred flora glyphs)
 * so particles render above terrain but below UI overlays.
 *
 * Each particle:
 * - Projects from world-space float position to screen using worldToScreen.
 * - Fades linearly: opacity = 1 − age/maxAge.
 * - Shimmers: brightness oscillates via sin(time * SHIMMER_FREQ + tileHash offset).
 */
export const renderPollen = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  time: number,
): void => {
  if (state.pollen.length === 0) return

  const { charWidth, charHeight } = metrics
  const { camera, viewportWidth, viewportHeight } = state

  const savedAlpha = ctx.globalAlpha

  for (const p of state.pollen) {
    const profile = POLLEN_PROFILES[p.profileId]
    if (!profile) continue

    const { px, py } = worldToScreen(p.x, p.y, camera, charWidth, charHeight, viewportWidth, viewportHeight)

    // Fade: linear from 1 → 0 over lifetime
    const opacity = 1 - p.age / p.maxAge

    // Shimmer: per-particle brightness oscillation using tile-hash for variation
    const h = tileHash(Math.floor(p.x), Math.floor(p.y))
    const shimmerDelta = Math.sin(time * SHIMMER_FREQ + (h % 628) / 100) * SHIMMER_RANGE
    const color = shiftLuminance(profile.color, shimmerDelta)

    ctx.globalAlpha = savedAlpha * Math.max(0, opacity)
    ctx.fillStyle = color
    ctx.fillText(profile.glyph, px, py)
  }

  ctx.globalAlpha = savedAlpha
}
