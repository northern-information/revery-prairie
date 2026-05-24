import { GLINT_ZONE_CHARS, GLINT_ZONE_COLORS, GLINT_ZONE_DENSITY, GLINT_ZONE_SPEED } from '../../constants'
import { posKey, tileHash } from '../../position'
import { viewportToScreen } from '../../projection'
import { Zone } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { getLastVisibleSet } from '../../visibility'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// Animated sparkle chars on tiles in state.glintZones (overworld only).
// Per-tile density scales with glintOpacity so sparser tiles fade out
// gracefully when the patch dims.

const isActive = (state: GameState): boolean => state.currentZone === Zone.Overworld

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  if (state.glintZones.size === 0) return

  const { camera, viewportWidth, viewportHeight, player } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)
  // RP-38 — only sparkle on currently-visible or fully-discovered tiles.
  // The `effect` slot draws after the fog-mask pass (in world-overlay), so
  // sparkles would otherwise paint through the mask onto unseen prairie.
  const visibleSet = getLastVisibleSet()
  const fullyDiscovered = state.overworldFogDiscovered

  // Iterate glintZones directly instead of the full viewport. The previous
  // approach called posKey + isInBounds for every viewport tile — O(viewport²)
  // string allocations per frame — even though only a small fraction of tiles
  // are glint zones. Now we only visit matching tiles and check viewport bounds.
  // Keys are parsed with indexOf/slice to avoid the array allocation of split().
  for (const key of state.glintZones) {
    const sep = key.indexOf(',')
    const wx = Number(key.slice(0, sep))
    const wy = Number(key.slice(sep + 1))

    const vx = wx - camera.x
    const vy = wy - camera.y
    if (vx < bounds.vxStart || vx >= bounds.vxEnd) continue
    if (vy < bounds.vyStart || vy >= bounds.vyEnd) continue

    if (wx === player.x && wy === player.y) continue

    const tileKey = posKey(wx, wy)
    if (!visibleSet?.has(tileKey) && !fullyDiscovered.has(tileKey)) continue

    const opacity = state.glintOpacity.get(key) ?? 0
    if (opacity <= 0) continue

    const h = tileHash(wx + state.rainSeed, wy)
    const effectiveDensity = Math.ceil(GLINT_ZONE_DENSITY / opacity)
    if (h % effectiveDensity !== 0) continue

    const glintPhase = ((h >> 4) + Math.floor(time * GLINT_ZONE_SPEED)) % GLINT_ZONE_CHARS.length
    const glintColorPhase = ((h >> 8) + Math.floor(time * GLINT_ZONE_SPEED * 0.7)) % GLINT_ZONE_COLORS.length

    const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
    ctx.fillStyle = GLINT_ZONE_COLORS[glintColorPhase]
    ctx.fillText(GLINT_ZONE_CHARS[glintPhase], px, py + liftAt(tierGrid, wx, wy, state.mapWidth, state.mapHeight))
  }
}

export const glintingZoneSparklePass: RenderPass = {
  id: 'glinting-zone-sparkle',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(glintingZoneSparklePass)
