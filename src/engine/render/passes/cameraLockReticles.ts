import {
  ACTION_COLOR,
  CAMERA_LOCK_RETICLE_SIZE_PX,
  CAMERA_LOCK_RETICLE_THICKNESS_PX,
} from '../../constants'
import type { CharMetrics, GameState } from '../../types'
import { type RenderPass, registerPass } from '../passes'

// Four hot-pink L-shaped corner reticles at the playfield corners. Active
// only while the camera is locked on the player (follow mode). Right-edge
// reticles align to viewportWidth - rightInsetTiles so they sit at the
// playfield corner, not the offscreen sidebar edge.
//
// Mutually exclusive with edgeScrollIndicatorPass by virtue of mode: the
// indicator's alpha is forced to 0 in follow mode, so only one of the two
// passes draws at any given time.

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
  const right = (state.viewportWidth - state.rightInsetTiles) * charWidth
  const bottom = state.viewportHeight * charHeight
  const arm = CAMERA_LOCK_RETICLE_SIZE_PX
  const t = CAMERA_LOCK_RETICLE_THICKNESS_PX

  ctx.save()
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
