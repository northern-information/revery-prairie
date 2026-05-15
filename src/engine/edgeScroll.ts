import { updateCamera } from './camera'
import { EDGE_SCROLL_SPEED_TILES_PER_SEC, EDGE_SCROLL_ZONE_PX } from './constants'

import type { CharMetrics, GameState } from './types'

/**
 * Compute the edge-scroll velocity (in tiles/second) for the given cursor
 * position relative to the canvas. -1 means scroll left/up, +1 means
 * scroll right/down, 0 means no scroll on that axis.
 */
export const computeEdgeScrollDirection = (
  cursorPx: number,
  cursorPy: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
  zonePx: number = EDGE_SCROLL_ZONE_PX,
): { dx: number; dy: number } => {
  let dx = 0
  let dy = 0
  // Cursor must be inside the playfield rectangle to count. The right edge
  // here is the visible playfield edge (callers exclude any sidebar
  // overlay), so cursor positions past canvasWidthPx are over UI overlays
  // and must not trigger panning.
  if (cursorPx >= 0 && cursorPx < zonePx) dx = -1
  else if (cursorPx <= canvasWidthPx && cursorPx > canvasWidthPx - zonePx) dx = 1
  if (cursorPy >= 0 && cursorPy < zonePx) dy = -1
  else if (cursorPy <= canvasHeightPx && cursorPy > canvasHeightPx - zonePx) dy = 1
  return { dx, dy }
}

/**
 * Apply edge-scroll for one frame. Only runs in 'free' (RTS pan) mode —
 * 'follow' mode early-returns so cursor position at an edge has no effect
 * on the camera. Mode is changed by explicit user input (spacebar, WASD,
 * click-to-move) only; tickEdgeScroll never flips it. In free mode the
 * cursor inside EDGE_SCROLL_ZONE_PX of any canvas edge advances
 * state.camera, clamped to overscrolled map bounds. Time-based: uses the
 * delta between this call and state.lastEdgeScrollTime so velocity is
 * frame-rate independent.
 */
const FADE_IN_MS = 120
const FADE_OUT_MS = 280

export const tickEdgeScroll = (state: GameState, metrics: CharMetrics, time: number): void => {
  // Compute dt before any early returns so the indicator alpha can advance
  // even when the cursor is outside the edge zone or the camera is paused.
  const dt = time - state.lastEdgeScrollTime
  state.lastEdgeScrollTime = time
  const dtValid = dt > 0 && dt <= 200

  // In follow mode the camera is locked on the player: no edge-scroll, no
  // mode flip, and any in-progress indicator alpha fades out cleanly.
  if (state.cameraMode === 'follow') {
    state.edgeScrollDirection = { dx: 0, dy: 0 }
    if (dtValid) {
      state.edgeScrollIndicatorAlpha = Math.max(
        0,
        state.edgeScrollIndicatorAlpha - dt / FADE_OUT_MS,
      )
    }
    return
  }

  // edgeScrollPos is set on canvas mousemove (regardless of sidebar overlay)
  // and cleared on mouseleave. cursorScreenPos can't be used here because
  // it's gated by sidebar overlap so the right-edge scroll never fires.
  if (!state.edgeScrollPos) {
    state.edgeScrollDirection = { dx: 0, dy: 0 }
    if (dtValid) {
      state.edgeScrollIndicatorAlpha = Math.max(
        0,
        state.edgeScrollIndicatorAlpha - dt / FADE_OUT_MS,
      )
    }
    return
  }
  // Use the visible canvas region (excluding the sidebar columns) so the
  // right-edge scroll zone lands at the visual right edge of the playfield.
  const visibleWidthPx = (state.viewportWidth - state.rightInsetTiles) * metrics.charWidth
  const canvasHeightPx = state.viewportHeight * metrics.charHeight
  const { dx, dy } = computeEdgeScrollDirection(
    state.edgeScrollPos.x,
    state.edgeScrollPos.y,
    visibleWidthPx,
    canvasHeightPx,
  )
  // Always publish the active direction so the renderer can draw the
  // hot-pink edge indicator regardless of frame-skip conditions below.
  state.edgeScrollDirection = { dx, dy }

  // Advance indicator alpha and latch the last active direction for
  // rendering, so the fade-out shows the correct edges.
  if (dtValid) {
    if (dx !== 0 || dy !== 0) {
      state.edgeScrollIndicatorDirection = { dx, dy }
      state.edgeScrollIndicatorAlpha = Math.min(
        1,
        state.edgeScrollIndicatorAlpha + dt / FADE_IN_MS,
      )
    } else {
      state.edgeScrollIndicatorAlpha = Math.max(
        0,
        state.edgeScrollIndicatorAlpha - dt / FADE_OUT_MS,
      )
    }
  }

  if (dt <= 0 || dt > 200) {
    // First frame or background-tab pause: skip the camera mutation but
    // keep the indicator state up to date.
    return
  }
  if (dx === 0 && dy === 0) return

  const tilesPerMs = EDGE_SCROLL_SPEED_TILES_PER_SEC / 1000
  // Translate the screen-axis edge direction into world-tile camera
  // deltas. The world is rotated 45°: a pure screen-x nudge requires
  // moving camera diagonally in world space so the user sees
  // horizontal-only motion. Invert the forward projection
  //   screenDx = (worldDx - worldDy) * 1
  //   screenDy = (worldDx + worldDy) * 0.5
  // (using normalized units; speed * dt scales the magnitude).
  // Inverse: worldDx = screenDx/2 + screenDy, worldDy = -screenDx/2 + screenDy
  const camDxPerTile = dx * 0.5 + dy
  const camDyPerTile = dx * -0.5 + dy
  // Accumulate fractional motion in cameraSubpixel; only step the
  // integer camera once enough fractional tiles have built up. Without
  // this accumulator, per-frame deltas at 60fps (~0.29 tiles) round
  // down every frame and the camera never moves.
  state.cameraSubpixel.x += camDxPerTile * tilesPerMs * dt
  state.cameraSubpixel.y += camDyPerTile * tilesPerMs * dt

  const stepX = Math.trunc(state.cameraSubpixel.x)
  const stepY = Math.trunc(state.cameraSubpixel.y)
  if (stepX === 0 && stepY === 0) return
  state.cameraSubpixel.x -= stepX
  state.cameraSubpixel.y -= stepY

  // Free-pan overscroll: allow the camera to extend past the map by a full
  // viewport on each side so the user can pan the map all the way into a
  // corner. The renderer already paints out-of-bounds tiles as space (or
  // dark void in cave/ruin zones), so overscroll just shows more space.
  // The diamond footprint extends diagonally past the rectangular
  // viewport bounds — without this overscroll, the corners are
  // unreachable even at "max pan".
  const visibleWidth = state.viewportWidth - state.rightInsetTiles
  const overscrollX = state.viewportWidth
  const overscrollY = state.viewportHeight
  const minX = -overscrollX
  const maxX = Math.max(0, state.mapWidth - visibleWidth) + overscrollX
  const minY = -overscrollY
  const maxY = Math.max(0, state.mapHeight - state.viewportHeight) + overscrollY

  state.camera.x = Math.max(minX, Math.min(state.camera.x + stepX, maxX))
  state.camera.y = Math.max(minY, Math.min(state.camera.y + stepY, maxY))
}

/**
 * Snap camera back to follow mode and recenter on the player. Called
 * after a successful WASD-driven move. Click-to-move and other
 * movement paths do NOT call this — they leave the user's pan intact.
 *
 * Force-recenters in the same call: flipping cameraMode alone is not
 * enough because tickEdgeScroll will flip it straight back to 'free' on
 * the next frame whenever state.edgeScrollPos lingers in an edge zone
 * (e.g. mouse parked near the canvas edge). Without the force-recenter,
 * movePlayer's internal updateCamera early-returns in free mode and the
 * player accumulates off-center on canvas with every WASD step.
 */
export const recenterCamera = (state: GameState): void => {
  state.cameraMode = 'follow'
  updateCamera(state, true)
}
