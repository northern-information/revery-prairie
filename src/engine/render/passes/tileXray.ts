import { isInBounds, posKey } from '../../position'
import {
  getAvatarScreenRect,
  getTileScreenRect,
  isTileOccludingAvatar,
  worldToScreen,
  XRAY_ALPHA,
} from '../../projection'
import { getElevationTier, getTierLift } from '../../tileBg'
import { getCacheWorldOrigin, getOrBuildCache } from '../../tileBgCache'
import { Zone } from '../../types'
import { registerPass } from '../passes'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// RP-65 — Tile x-ray pass. Runs in slot `tile-xray` (between
// `tile-glyph` and `entity`). For each lifted tile in the camera
// viewport that occludes the player avatar's screen rect, clears
// the tile bbox on the live canvas and re-blits the corresponding
// region from the bg cache at XRAY_ALPHA. The player avatar then
// draws on top in the `entity` slot, fully opaque.
//
// Terrain-only scope (per the v11 R5-derived spec): only bg cache
// content (bg + cliff walls + cliff shadow) fades. Flora glyphs,
// entities, oaks, and overlay passes draw normally per their own
// passes.

// Same overlap buffer used by the bg cache when painting tiles.
// Including it in the clearRect bbox avoids leaving a 2px sliver
// of neighbor-spillover uncovered at the tile borders.
const TILE_BG_OVERLAP = 2

const isActive = (state: GameState): boolean => state.currentZone === Zone.Overworld

const tileLift = (state: GameState, x: number, y: number): number => {
  const elev = state.elevation.get(posKey(x, y))
  if (elev === undefined) return 0
  return getTierLift(getElevationTier(elev))
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, _time: number): void => {
  const { camera, viewportWidth, viewportHeight, map, player, mapWidth, mapHeight } = state
  const { charWidth, charHeight } = metrics
  const halfW = charWidth / 2
  const halfH = charHeight / 2

  const cache = getOrBuildCache(state, map, charWidth, charHeight)
  const { worldOriginX: cacheOX, worldOriginY: cacheOY } = getCacheWorldOrigin(cache)

  // Avatar screen rect anchored at the player's lifted drawn position.
  const playerLift = tileLift(state, player.x, player.y)
  const { px: playerBaseX, py: playerBaseY } = worldToScreen(
    player.x,
    player.y,
    camera,
    charWidth,
    charHeight,
    viewportWidth,
    viewportHeight
  )
  const avatarRect = getAvatarScreenRect(playerBaseX, playerBaseY + playerLift, charWidth, charHeight)

  for (let vy = 0; vy < viewportHeight; vy++) {
    for (let vx = 0; vx < viewportWidth; vx++) {
      const tx = vx + camera.x
      const ty = vy + camera.y
      if (!isInBounds(tx, ty, mapWidth, mapHeight)) continue
      const lift = tileLift(state, tx, ty)
      // Lift is negative for raised tiles. Zero or positive lift
      // means the tile sits at or below baseline — no occlusion
      // possible.
      if (lift >= 0) continue

      const { px: baseX, py: baseY } = worldToScreen(
        tx,
        ty,
        camera,
        charWidth,
        charHeight,
        viewportWidth,
        viewportHeight
      )
      const tileRect = getTileScreenRect(baseX, baseY, charWidth, charHeight, lift)
      if (!isTileOccludingAvatar(tx, ty, tileRect, player.x, player.y, avatarRect)) continue

      // Lifted tile anchor on the live canvas.
      const margin = TILE_BG_OVERLAP + 1
      const liftedAnchorY = baseY + lift
      const dstX = baseX - halfW - margin
      const dstY = liftedAnchorY - margin
      const w = 2 * charWidth + 2 * margin
      const h = charHeight + 2 * margin

      // Source rect in the cache. Cache anchors at
      //   cache_px = (tx - ty) * charWidth + cacheOX + halfW
      //   cache_py = (tx + ty) * halfH + cacheOY + lift
      // The bbox offsets from the anchor are identical to the
      // live canvas bbox relative to the lifted anchor.
      const srcAnchorX = (tx - ty) * charWidth + cacheOX + halfW
      const srcAnchorY = (tx + ty) * halfH + cacheOY + lift
      const srcX = srcAnchorX - halfW - margin
      const srcY = srcAnchorY - margin

      ctx.clearRect(dstX, dstY, w, h)
      const savedAlpha = ctx.globalAlpha
      ctx.globalAlpha = XRAY_ALPHA
      ctx.drawImage(cache.canvas, srcX, srcY, w, h, dstX, dstY, w, h)
      ctx.globalAlpha = savedAlpha
    }
  }
}

export const tileXrayPass: RenderPass = {
  id: 'tile-xray',
  slot: 'tile-xray',
  isActive,
  draw,
}

registerPass(tileXrayPass)
