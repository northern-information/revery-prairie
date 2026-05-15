import {
  CAMERA_LOCK_RETICLE_SIZE_PX,
  CAMERA_LOCK_RETICLE_THICKNESS_PX,
} from '@/engine/constants'
import type { GameState } from '@/engine/types'

// Four hot-pink L-shaped reticles framing the browser viewport while the
// camera is locked on the player. Rendered as a fixed-position DOM overlay
// (not via the canvas pass registry) so it can z-order above sidebar panels,
// the event log, and any other UI surface. pointer-events: none so it never
// intercepts clicks.

const ARM = CAMERA_LOCK_RETICLE_SIZE_PX
const T = CAMERA_LOCK_RETICLE_THICKNESS_PX
const GLOW = 'rgba(255, 105, 180, 0.35)'
const TRANSPARENT = 'rgba(255, 105, 180, 0)'
const COLOR = '#ff69b4'

interface CameraLockReticlesProps {
  state: GameState
}

export const CameraLockReticles = ({ state }: CameraLockReticlesProps) => {
  if (state.cameraMode !== 'follow') return null

  // Each corner: two arms (horizontal + vertical) with an inner-glow
  // gradient extending into the viewport, plus a solid line at the edge.
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
      data-testid="camera-lock-reticles"
    >
      {/* Top-left */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: ARM,
          height: T,
          background: COLOR,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: T,
          width: ARM,
          height: ARM,
          background: `linear-gradient(to bottom, ${GLOW}, ${TRANSPARENT})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: T,
          height: ARM,
          background: COLOR,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: T,
          top: 0,
          width: ARM,
          height: ARM,
          background: `linear-gradient(to right, ${GLOW}, ${TRANSPARENT})`,
        }}
      />
      {/* Top-right */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: ARM,
          height: T,
          background: COLOR,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: T,
          width: ARM,
          height: ARM,
          background: `linear-gradient(to bottom, ${GLOW}, ${TRANSPARENT})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: T,
          height: ARM,
          background: COLOR,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: T,
          top: 0,
          width: ARM,
          height: ARM,
          background: `linear-gradient(to left, ${GLOW}, ${TRANSPARENT})`,
        }}
      />
      {/* Bottom-left */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: ARM,
          height: T,
          background: COLOR,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: T,
          width: ARM,
          height: ARM,
          background: `linear-gradient(to top, ${GLOW}, ${TRANSPARENT})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: T,
          height: ARM,
          background: COLOR,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: T,
          bottom: 0,
          width: ARM,
          height: ARM,
          background: `linear-gradient(to right, ${GLOW}, ${TRANSPARENT})`,
        }}
      />
      {/* Bottom-right */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: ARM,
          height: T,
          background: COLOR,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: T,
          width: ARM,
          height: ARM,
          background: `linear-gradient(to top, ${GLOW}, ${TRANSPARENT})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: T,
          height: ARM,
          background: COLOR,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: T,
          bottom: 0,
          width: ARM,
          height: ARM,
          background: `linear-gradient(to left, ${GLOW}, ${TRANSPARENT})`,
        }}
      />
    </div>
  )
}
