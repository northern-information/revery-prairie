// RP-25 — Egregoric fauna aura render pass.
//
// Draws a subtle alpha-pulsing halo behind every live wrongBee and
// pierceWalker. Sits in the world-overlay slot (between tile-bg and
// the entity glyph layer) so the halo reads as a backlight, never
// covers the glyph. Active only in the overworld; the fauna do not
// spawn elsewhere.
import { TILE_COLORS } from '../../constants'
import { ComponentType } from '../../ecs/types'
import { isInBounds } from '../../position'
import { drawCellBackground, viewportToScreen } from '../../projection'
import { TileType, Zone } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

interface FaunaTile {
  x: number
  y: number
  eid: number
}

const collectFaunaTiles = (state: GameState): FaunaTile[] => {
  const tiles: FaunaTile[] = []
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'wrongBee' && tag !== 'pierceWalker') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    tiles.push({ x: pos.x, y: pos.y, eid })
  }
  return tiles
}

const isActive = (state: GameState): boolean => {
  if (state.currentZone !== Zone.Overworld) return false
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag === 'wrongBee' || tag === 'pierceWalker') return true
  }
  return false
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight, map } = state
  const { charWidth, charHeight } = metrics
  const tiles = collectFaunaTiles(state)
  if (tiles.length === 0) return
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  const savedAlpha = ctx.globalAlpha
  ctx.fillStyle = TILE_COLORS[TileType.Egregore]
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)
  for (const t of tiles) {
    const vx = t.x - camera.x
    const vy = t.y - camera.y
    if (vx < bounds.vxStart || vx >= bounds.vxEnd) continue
    if (vy < bounds.vyStart || vy >= bounds.vyEnd) continue
    if (!isInBounds(t.x, t.y, state.mapWidth, state.mapHeight)) continue
    if (map[t.y][t.x].type === TileType.Space) continue
    // Per-entity desynchronized pulse: every entity gets a small phase
    // offset from its id so two adjacent fauna do not pulse in lockstep.
    const alpha = 0.15 + 0.1 * Math.sin(time * 0.002 + t.eid * 0.7)
    ctx.globalAlpha = alpha
    const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
    drawCellBackground(
      ctx,
      px,
      py + liftAt(tierGrid, t.x, t.y, state.mapWidth, state.mapHeight),
      charWidth,
      charHeight
    )
  }
  ctx.globalAlpha = savedAlpha
}

export const egregoreFaunaAuraPass: RenderPass = {
  id: 'egregore-fauna-aura',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(egregoreFaunaAuraPass)
