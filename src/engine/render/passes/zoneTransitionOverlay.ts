import { BG_COLOR } from '../../constants'
import { worldToScreen } from '../../projection'
import { getZoneTransitionProgress } from '../../zoneTransition'
import type { CharMetrics, GameState, Position } from '../../types'
import { type RenderPass, registerPass } from '../passes'

// Glyphs used for the ASCII dissolve. A small alphabet keeps the
// noise field readable and consistent with the game's renderer
// idiom. Sampled per-cell from a seeded PRNG that uses tile
// coordinates so the noise pattern is stable per-frame (no flicker)
// while still varying across the transition.
const DISSOLVE_GLYPHS = ['.', ':', ';', '%', '#', '*', '/', '\\', '|', '-']

const mulberry32 = (seed: number): (() => number) => {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Density curve: 0 -> 0.5 -> 0 across progress 0..1. Peaks at midpoint.
const dissolveDensity = (progress: number): number => {
  // sin pulse: 0 at 0, 1 at 0.5, 0 at 1.
  return Math.sin(progress * Math.PI)
}

// Iris radius interpolated from 0 at progress 0 to maxRadius at
// progress 0.5, then back to 0 at progress 1. Triangle wave.
const irisRadius = (progress: number, maxRadius: number): number => {
  const triangle = progress < 0.5 ? progress * 2 : (1 - progress) * 2
  return triangle * maxRadius
}

// Iris center tile: pre-midpoint, the captured source tile (entrance
// or exit). Post-midpoint, the player's new position — they have
// just been placed at the destination spawn by the deferred swap.
const getIrisCenterTile = (state: GameState, progress: number): Position => {
  const transition = state.zoneTransition
  if (!transition) return state.player
  if (progress < 0.5) return transition.irisCenter
  return state.player
}

const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  time: number,
): void => {
  const transition = state.zoneTransition
  if (!transition) return

  const progress = getZoneTransitionProgress(transition, time)
  const pxWidth = state.viewportWidth * metrics.charWidth
  const pxHeight = state.viewportHeight * metrics.charHeight

  // ----- Dissolve layer (ASCII noise) -----
  const density = dissolveDensity(progress)
  if (density > 0) {
    ctx.font = metrics.font
    ctx.textBaseline = 'top'
    const seed = Math.floor(transition.startTime) ^ Math.floor(progress * 1000)
    const rng = mulberry32(seed)
    for (let vy = 0; vy < state.viewportHeight; vy++) {
      for (let vx = 0; vx < state.viewportWidth; vx++) {
        if (rng() > density) continue
        const glyph = DISSOLVE_GLYPHS[Math.floor(rng() * DISSOLVE_GLYPHS.length)]
        const px = vx * metrics.charWidth
        const py = vy * metrics.charHeight
        // Solid bg behind the glyph keeps the noise visually weighty.
        ctx.fillStyle = BG_COLOR
        ctx.fillRect(px, py, metrics.charWidth, metrics.charHeight)
        ctx.fillStyle = '#5a5a5a'
        ctx.fillText(glyph, px, py)
      }
    }
  }

  // ----- Iris layer (dark circle) -----
  // Max radius covers the screen diagonal so the iris fully fills
  // the viewport at peak regardless of where its center sits.
  const maxRadius = Math.hypot(pxWidth, pxHeight)
  const radius = irisRadius(progress, maxRadius)
  if (radius > 0) {
    const centerTile = getIrisCenterTile(state, progress)
    const centerScreen = worldToScreen(
      centerTile.x,
      centerTile.y,
      state.camera,
      metrics.charWidth,
      metrics.charHeight,
      state.viewportWidth,
      state.viewportHeight,
    )
    ctx.fillStyle = BG_COLOR
    ctx.beginPath()
    ctx.arc(centerScreen.px, centerScreen.py, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

export const zoneTransitionOverlayPass: RenderPass = {
  id: 'zone-transition-overlay',
  slot: 'screen-overlay',
  isActive: (state) => state.zoneTransition !== null,
  draw,
}

registerPass(zoneTransitionOverlayPass)
