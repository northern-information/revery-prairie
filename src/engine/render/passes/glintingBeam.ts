import { GLINT_BEAM_CHAR, GLINT_ZONE_COLORS } from '../../constants'
import { computeBeamSegmentOpacity, tileBeamLength, tileBeamMaxOpacity, tileHasBeam } from '../../glintZones'
import { posKey, tileHash } from '../../position'
import { viewportToScreen } from '../../projection'
import { Zone } from '../../types'
import { isTileInVisibleViewport } from '../../viewportBounds'
import { getLastVisibleSet } from '../../visibility'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// Diagonal '/' beams pour from upper-right onto ~30% of glinting tiles.
// Per-segment opacity blends patch opacity, beam max opacity, and a
// segment-position falloff that animates over time.

const isActive = (state: GameState): boolean => state.currentZone === Zone.Overworld

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  const savedAlpha = ctx.globalAlpha
  // RP-38 — gate beam segments on the prairie's visible / fully-discovered
  // sets so glint beams do not leak onto unseen or dim-memory tiles. The
  // fog-mask pass runs in world-overlay (before `effect`), so effect-slot
  // glyphs are not covered by it. Check explicitly here.
  const visibleSet = getLastVisibleSet()
  const fullyDiscovered = state.overworldFogDiscovered

  for (const key of state.glintZones) {
    const sep = key.indexOf(',')
    if (sep < 0) continue
    const sx = Number(key.slice(0, sep))
    const sy = Number(key.slice(sep + 1))
    if (!tileHasBeam(sx, sy, state.rainSeed)) continue
    const patchOpacity = state.glintOpacity.get(key) ?? 0
    if (patchOpacity <= 0) continue

    const length = tileBeamLength(sx, sy, state.rainSeed)
    const beamMax = tileBeamMaxOpacity(sx, sy, state.rainSeed)
    if (beamMax <= 0) continue
    const colorIndex = tileHash(sx + state.rainSeed, sy + 1) % GLINT_ZONE_COLORS.length

    for (let i = 0; i < length; i++) {
      const wx = sx + i + 1
      const wy = sy - i - 1
      const vx = wx - camera.x
      const vy = wy - camera.y
      if (!isTileInVisibleViewport(vx, vy, viewportWidth, viewportHeight)) continue

      const segKey = posKey(wx, wy)
      if (!visibleSet?.has(segKey) && !fullyDiscovered.has(segKey)) continue

      const segOpacity = computeBeamSegmentOpacity(i, length, time)
      const finalOpacity = patchOpacity * segOpacity * beamMax
      if (finalOpacity <= 0) continue

      ctx.globalAlpha = finalOpacity
      ctx.fillStyle = GLINT_ZONE_COLORS[colorIndex]
      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      ctx.fillText(GLINT_BEAM_CHAR, px, py + liftAt(tierGrid, wx, wy, state.mapWidth, state.mapHeight))
    }
  }
  ctx.globalAlpha = savedAlpha
}

export const glintingBeamPass: RenderPass = {
  id: 'glinting-beam',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(glintingBeamPass)
