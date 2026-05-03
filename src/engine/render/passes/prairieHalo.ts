import { PRAIRIE_HALO_PULSE_SPEED } from '../../constants'
import { DeepTimePhase, Zone, type CharMetrics, type GameState } from '../../types'
import { getOrBuildHaloCache } from '../haloCache'
import { type RenderPass, registerPass } from '../passes'

const isActive = (state: GameState): boolean => {
  if (state.currentZone !== Zone.Overworld) return false
  if (state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering)
    return false
  return true
}

// Cached blur filter string — blurPx only changes when charWidth/charHeight
// changes (zoom toggle or font resize), so we avoid rebuilding the string
// every frame.
let _blurFilter = ''
let _blurPx = -1

// Composites the per-map halo cache (peak-intensity falloff) with the
// global breathing pulse applied as ctx.globalAlpha and a single
// ctx.filter = blur(...) pass. drawImage at a camera-derived translation.
//
// Source clipping: without it, drawImage composites the entire world-space
// halo canvas (potentially thousands of pixels per side) even when most of
// it is off-screen. A source pixel at halo offset (sx, sy) lands on screen
// at (sx+dx, sy+dy) and contributes blurred color within ±blurPx of that
// point. We only need source pixels whose blurred spread overlaps the
// viewport, i.e. screen range [-blurPx, canvasW+blurPx] × [-blurPx, canvasH+blurPx],
// which maps to halo coords [-blurPx-dx, canvasW+blurPx-dx] × [-blurPx-dy, canvasH+blurPx-dy].
const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  time: number,
): void => {
  const { camera, viewportWidth, viewportHeight, map } = state
  const { charWidth, charHeight } = metrics
  const halo = getOrBuildHaloCache(map, charWidth, charHeight)
  const halfH = charHeight / 2
  const halfW = charWidth / 2
  const originX = (viewportHeight * charWidth) / 2 - halfW
  const originY = ((viewportHeight - viewportWidth) / 4) * charHeight
  const dx = (camera.y - camera.x) * charWidth + originX - halo.worldOriginX
  const dy = -(camera.x + camera.y) * halfH + originY - halo.worldOriginY
  const pulse = Math.sin(time * PRAIRIE_HALO_PULSE_SPEED) * 0.5 + 0.5
  const blurPx = Math.max(charWidth, charHeight) * 1.5

  if (blurPx !== _blurPx) {
    _blurPx = blurPx
    _blurFilter = `blur(${String(blurPx)}px)`
  }

  const canvasW = ctx.canvas.width
  const canvasH = ctx.canvas.height
  const sx = Math.max(0, Math.floor(-blurPx - dx))
  const sy = Math.max(0, Math.floor(-blurPx - dy))
  const sxEnd = Math.min(halo.canvas.width, Math.ceil(canvasW + blurPx - dx))
  const syEnd = Math.min(halo.canvas.height, Math.ceil(canvasH + blurPx - dy))

  if (sx >= sxEnd || sy >= syEnd) return

  const sw = sxEnd - sx
  const sh = syEnd - sy
  const savedFilter = ctx.filter
  const savedAlpha = ctx.globalAlpha
  ctx.globalAlpha = pulse
  ctx.filter = _blurFilter
  ctx.drawImage(halo.canvas, sx, sy, sw, sh, sx + dx, sy + dy, sw, sh)
  ctx.filter = savedFilter
  ctx.globalAlpha = savedAlpha
}

export const prairieHaloPass: RenderPass = {
  id: 'prairie-halo',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(prairieHaloPass)
