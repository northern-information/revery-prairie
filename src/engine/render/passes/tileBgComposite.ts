import { flushDirtyTiles, getOrBuildCache } from '../../tileBgCache'
import type { CharMetrics, GameState } from '../../types'
import { type RenderPass, registerPass } from '../passes'

// bg-cache slot: composites the per-map tile-bg + cube-edge cache onto the
// main canvas. The cache is sized to the full world iso bounding box, so
// the per-frame work is one drawImage at a camera-derived translation.
//
// Cache origin maps tile (mx, my) to cache pixel
//   px = (mx - my) * charWidth + cache.worldOriginX + halfW
//   py = (mx + my) * halfH + cache.worldOriginY + lift
// The renderer's viewport projection for the same tile is
//   px = (mx - my) * charWidth + (camera.y - camera.x) * charWidth + originX + halfW
//   py = (mx + my) * halfH + (-(camera.x + camera.y)) * halfH + originY + lift
// Translation between them collapses to constants in (mx, my):
//   dx = (camera.y - camera.x) * charWidth + originX - cache.worldOriginX
//   dy = -(camera.x + camera.y) * halfH + originY - cache.worldOriginY

const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  _time: number,
): void => {
  const { camera, viewportWidth, viewportHeight, map } = state
  const { charWidth, charHeight } = metrics
  flushDirtyTiles(state, map)
  const cache = getOrBuildCache(state, map, charWidth, charHeight)
  const halfH = charHeight / 2
  const halfW = charWidth / 2
  const originX = (viewportHeight * charWidth) / 2 - halfW
  const originY = ((viewportHeight - viewportWidth) / 4) * charHeight
  const dx = (camera.y - camera.x) * charWidth + originX - cache.worldOriginX
  const dy = -(camera.x + camera.y) * halfH + originY - cache.worldOriginY
  ctx.drawImage(cache.canvas, dx, dy)
}

export const tileBgCompositePass: RenderPass = {
  id: 'tile-bg-composite',
  slot: 'bg-cache',
  isActive: () => true,
  draw,
}

registerPass(tileBgCompositePass)
