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

// Composites the per-map halo cache (peak-intensity falloff) with the
// global breathing pulse applied as ctx.globalAlpha and a single
// ctx.filter = blur(...) pass. drawImage at a camera-derived translation.
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
  const savedFilter = ctx.filter
  const savedAlpha = ctx.globalAlpha
  ctx.globalAlpha = pulse
  ctx.filter = `blur(${String(blurPx)}px)`
  ctx.drawImage(halo.canvas, dx, dy)
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
