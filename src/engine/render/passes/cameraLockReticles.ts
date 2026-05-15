import {
  ACTION_COLOR,
  CAMERA_LOCK_RETICLE_SIZE_PX,
  CAMERA_LOCK_RETICLE_THICKNESS_PX,
} from '../../constants'
import type { CharMetrics, GameState } from '../../types'
import { type RenderPass, registerPass } from '../passes'

// Four hot-pink L-shaped corner reticles framing the browser viewport
// while the camera is locked on the player (follow mode). Reticles sit at
// the canvas corners — including the corner above the sidebar — so they
// always read as "viewport-level" frame markers rather than playfield UI.
// Each arm has an inner glow gradient extending into the viewport, matching
// the visual language of edgeScrollIndicatorPass.
//
// Mutually exclusive with edgeScrollIndicatorPass by virtue of mode: the
// indicator's alpha is forced to 0 in follow mode, so only one of the two
// passes draws at any given time.

const GLOW_RGBA_INNER = 'rgba(255, 105, 180, 0.35)'
const GLOW_RGBA_OUTER = 'rgba(255, 105, 180, 0)'

const isActive = (state: GameState): boolean => state.cameraMode === 'follow'

const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  _time: number,
): void => {
  const { charWidth, charHeight } = metrics
  const left = 0
  const top = 0
  const right = state.viewportWidth * charWidth
  const bottom = state.viewportHeight * charHeight
  const arm = CAMERA_LOCK_RETICLE_SIZE_PX
  const t = CAMERA_LOCK_RETICLE_THICKNESS_PX

  ctx.save()

  // Inner-glow gradients. Each corner has a horizontal arm fading away
  // from the edge it hugs, and a vertical arm fading the same way.
  // Painted before the solid L so the bright line sits on top.
  const paintArmGlow = (
    x: number,
    y: number,
    w: number,
    h: number,
    gradient: CanvasGradient,
  ): void => {
    ctx.fillStyle = gradient
    ctx.fillRect(x, y, w, h)
  }

  // Top-left
  {
    const horiz = ctx.createLinearGradient(left, top + t, left, top + t + arm)
    horiz.addColorStop(0, GLOW_RGBA_INNER)
    horiz.addColorStop(1, GLOW_RGBA_OUTER)
    paintArmGlow(left, top + t, arm, arm, horiz)
    const vert = ctx.createLinearGradient(left + t, top, left + t + arm, top)
    vert.addColorStop(0, GLOW_RGBA_INNER)
    vert.addColorStop(1, GLOW_RGBA_OUTER)
    paintArmGlow(left + t, top, arm, arm, vert)
  }
  // Top-right
  {
    const horiz = ctx.createLinearGradient(right, top + t, right, top + t + arm)
    horiz.addColorStop(0, GLOW_RGBA_INNER)
    horiz.addColorStop(1, GLOW_RGBA_OUTER)
    paintArmGlow(right - arm, top + t, arm, arm, horiz)
    const vert = ctx.createLinearGradient(right - t, top, right - t - arm, top)
    vert.addColorStop(0, GLOW_RGBA_INNER)
    vert.addColorStop(1, GLOW_RGBA_OUTER)
    paintArmGlow(right - t - arm, top, arm, arm, vert)
  }
  // Bottom-left
  {
    const horiz = ctx.createLinearGradient(left, bottom - t, left, bottom - t - arm)
    horiz.addColorStop(0, GLOW_RGBA_INNER)
    horiz.addColorStop(1, GLOW_RGBA_OUTER)
    paintArmGlow(left, bottom - t - arm, arm, arm, horiz)
    const vert = ctx.createLinearGradient(left + t, bottom, left + t + arm, bottom)
    vert.addColorStop(0, GLOW_RGBA_INNER)
    vert.addColorStop(1, GLOW_RGBA_OUTER)
    paintArmGlow(left + t, bottom - arm, arm, arm, vert)
  }
  // Bottom-right
  {
    const horiz = ctx.createLinearGradient(right, bottom - t, right, bottom - t - arm)
    horiz.addColorStop(0, GLOW_RGBA_INNER)
    horiz.addColorStop(1, GLOW_RGBA_OUTER)
    paintArmGlow(right - arm, bottom - t - arm, arm, arm, horiz)
    const vert = ctx.createLinearGradient(right - t, bottom, right - t - arm, bottom)
    vert.addColorStop(0, GLOW_RGBA_INNER)
    vert.addColorStop(1, GLOW_RGBA_OUTER)
    paintArmGlow(right - t - arm, bottom - arm, arm, arm, vert)
  }

  // Solid L-arms on top of the glow.
  ctx.fillStyle = ACTION_COLOR
  // Top-left
  ctx.fillRect(left, top, arm, t)
  ctx.fillRect(left, top, t, arm)
  // Top-right
  ctx.fillRect(right - arm, top, arm, t)
  ctx.fillRect(right - t, top, t, arm)
  // Bottom-left
  ctx.fillRect(left, bottom - t, arm, t)
  ctx.fillRect(left, bottom - arm, t, arm)
  // Bottom-right
  ctx.fillRect(right - arm, bottom - t, arm, t)
  ctx.fillRect(right - t, bottom - arm, t, arm)
  ctx.restore()
}

export const cameraLockReticlesPass: RenderPass = {
  id: 'camera-lock-reticles',
  slot: 'screen-overlay',
  isActive,
  draw,
}

registerPass(cameraLockReticlesPass)
