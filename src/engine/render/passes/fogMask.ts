import { BG_COLOR, FOG_EXPLORED_BRIGHTNESS } from '../../constants'
import { isInBounds, posKey } from '../../position'
import { getElevationTier, getTierLift } from '../../tileBg'
import { type CharMetrics, type GameState, TileType } from '../../types'
import { getLastVisibleSet, getTileVisibility, hasFogOfWar } from '../../visibility'
import { type RenderPass, registerPass } from '../passes'

// Fog-of-war background mask. Runs in world-overlay AFTER tileBgComposite
// and every other world-overlay pass, so masks cover both the cached tile
// bg and any world overlays. See harness/specs/fog-bg-mask.yaml.
//
// unexplored        → opaque BG_COLOR diamond (tile fully hidden)
// partiallyDiscovered → black diamond at alpha (1 - FOG_EXPLORED_BRIGHTNESS),
//                       which multiplies the underlying RGB to
//                       FOG_EXPLORED_BRIGHTNESS — same factor the central
//                       tile loop uses on the foreground glyph (renderer.ts).
// fullyDiscovered / visible → no mask.
//
// Diamond geometry matches the tileBgCache paint (TILE_BG_OVERLAP=2 px on
// each vertex), so the mask exactly covers both the cached fill and the
// south/east cube-edge stroke without leaving a 1-2 px halo of leaked color.

const TILE_BG_OVERLAP = 2
const PARTIAL_MASK_ALPHA = 1 - FOG_EXPLORED_BRIGHTNESS

const isActive = (state: GameState): boolean => hasFogOfWar(state.currentZone)

const tierAt = (state: GameState, x: number, y: number): number => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return 0
  return getElevationTier(state.elevation.get(posKey(x, y)))
}

const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  _time: number,
): void => {
  const visibleSet = getLastVisibleSet() ?? new Set<string>()
  const { camera, viewportWidth, viewportHeight, map, mapWidth, mapHeight } = state
  const { charWidth, charHeight } = metrics
  const halfH = charHeight / 2
  const halfW = charWidth / 2
  const originX = (viewportHeight * charWidth) / 2 - halfW
  const originY = ((viewportHeight - viewportWidth) / 4) * charHeight

  const savedFill = ctx.fillStyle
  const savedAlpha = ctx.globalAlpha

  // Same expanded tile-loop bounds the central tile loop uses so iso corner
  // diamonds are not clipped by the rectangular viewport.
  const tileLoopStart = -viewportHeight
  const tileLoopEndX = viewportWidth + viewportHeight
  const tileLoopEndY = viewportHeight + viewportWidth

  for (let vy = tileLoopStart; vy < tileLoopEndY; vy++) {
    for (let vx = tileLoopStart; vx < tileLoopEndX; vx++) {
      const mx = camera.x + vx
      const my = camera.y + vy
      if (!isInBounds(mx, my, mapWidth, mapHeight)) continue
      // Space tiles have no cached bg and no fog state — skip so the
      // twinkling-stars rendering downstream is not covered.
      if (map[my][mx].type === TileType.Space) continue

      const visibility = getTileVisibility(state, mx, my, visibleSet)
      if (visibility === 'visible' || visibility === 'fullyDiscovered') continue

      // Project tile center to canvas. Mirrors viewportToScreen + the lift
      // applied to py in the central tile loop and tileBgCache.tileWorldPos.
      const px = (vx - vy) * charWidth + originX + halfW
      const py = (vx + vy) * halfH + originY + getTierLift(tierAt(state, mx, my))
      const leftX = px - halfW
      const rightX = leftX + 2 * charWidth
      const topY = py
      const bottomY = topY + charHeight
      const cx = leftX + charWidth
      const cy = topY + halfH

      if (visibility === 'unexplored') {
        ctx.globalAlpha = 1
        ctx.fillStyle = BG_COLOR
      } else {
        // partiallyDiscovered
        ctx.globalAlpha = PARTIAL_MASK_ALPHA
        ctx.fillStyle = '#000'
      }

      ctx.beginPath()
      ctx.moveTo(cx, topY - TILE_BG_OVERLAP)
      ctx.lineTo(rightX + TILE_BG_OVERLAP, cy)
      ctx.lineTo(cx, bottomY + TILE_BG_OVERLAP)
      ctx.lineTo(leftX - TILE_BG_OVERLAP, cy)
      ctx.closePath()
      ctx.fill()
    }
  }

  ctx.globalAlpha = savedAlpha
  ctx.fillStyle = savedFill
}

export const fogMaskPass: RenderPass = {
  id: 'fog-mask',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(fogMaskPass)
